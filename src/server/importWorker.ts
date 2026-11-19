// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
import Queue, { Job } from 'bee-queue';
import {
  addPendingBulkImportRequest,
  cancelBulkImport,
  getBulkImportStatus,
  getNdjsonFileStatus,
  ExportManifest,
  initializeBulkFileCount,
  pushImportJob,
  pushNdjsonJobs
} from '../database/dbOperations';
import ndjsonQueue from '../queue/ndjsonProcessQueue';
import logger from './logger';
import { checkCancelled, setCancelled } from '../server/redisClient';
import FHIRClient from '../util/fhirClient';
import { createManifestHash } from '../util/baseUtils';
import { BadRequestError } from '../util/errorUtils';
import { deleteQueue } from '../queue/deleteQueue';

logger.info(`import-worker-${process.pid}: Import Worker Started!`);
const importQueue = new Queue('import', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true,
  activateDelayedJobs: true
});

// TODO: Update using bee-queue types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
importQueue.process(async (job: any) => {
  if (await checkCancelled(job.id)) {
    throw new Error('Import job canceled before start');
  }
  // Payload of createJob exists on job.data
  const { submissionClientId, manifestUrl, providerBaseUrl, replacesManifestUrl } = job.data;

  const providerClient = new FHIRClient(providerBaseUrl);

  let manifest: ExportManifest;
  try {
    manifest = await providerClient.get(manifestUrl, {
      headers: { Accept: 'application/json' }
    });
  } catch (error) {
    // Throwing lets Bee Queue apply retries/backoff.
    logger.warn(`Manifest ${manifestUrl} is not available yet; job ${job.id} will retry`);
    throw error;
  }

  // Replace the previous import only after the new manifest has been retrieved.
  if (replacesManifestUrl) {
    const manifestId = createManifestHash(submissionClientId, replacesManifestUrl);
    const existingBulkImportRequest = await getBulkImportStatus(manifestId);
    if (!existingBulkImportRequest) {
      throw new BadRequestError(`Unable to find status for manifest specified for replacement: ${replacesManifestUrl}`);
    }
    const jobInformation = await cancelBulkImport(manifestId);
    await stopJobs(jobInformation);
  }

  const manifestEntry = await addPendingBulkImportRequest(manifest, submissionClientId, manifestUrl, providerBaseUrl);

  await pushImportJob(manifestEntry, job.id);
  await initializeBulkFileCount(manifestEntry, manifest.output.length, -1);

  const ndjsonJobs = manifest.output.map(output =>
    ndjsonQueue.createJob({
      fileUrl: output.url,
      clientId: manifestEntry,
      resourceCount: -1,
      providerBaseUrl,
      requiresAccessToken: manifest.requiresAccessToken
    })
  );

  await ndjsonQueue.saveAll(ndjsonJobs);

  await pushNdjsonJobs(
    manifestEntry,
    ndjsonJobs.map(ndjsonJob => ndjsonJob.id)
  );

  return true;
});

async function stopJobs(jobInformation: { importJobIds: string[]; ndjsonJobIds: string[] }) {
  const { importJobIds, ndjsonJobIds } = jobInformation;

  // Prevent the creation of new ndjson jobs
  await Promise.all(
    importJobIds.map(async jobId => {
      await setCancelled(jobId); //set store cancelled flag for active job
      const job = await importQueue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info(`Import job ${jobId} was removed.`);
      } else {
        logger.info(`Import job ${jobId} not found in the queue (already removed).`);
      }
    })
  );

  // TODO: handle paging - page size seems to default to 100
  const jobPromises = [
    ndjsonQueue.getJobs('waiting'),
    ndjsonQueue.getJobs('delayed'),
    ndjsonQueue.getJobs('failed'),
    ndjsonQueue.getJobs('succeeded'),
    ndjsonQueue.getJobs('active')
  ];

  Promise.all(jobPromises).then((results: Job<NDJSONJobDataType>[][]) => {
    const waitingIds = results[0];
    const delayedIds = results[1];
    const failedIds = results[2];
    const succeededIds = results[3];
    const activeIds = results[4];

    waitingIds
      .concat(delayedIds)
      .filter(job => ndjsonJobIds.includes(job.id))
      .map(async job => {
        await job.remove();
        logger.info(`Ndjson job ${job.id} was cancelled before processing.`);
      });

    failedIds
      .concat(succeededIds)
      .filter(job => ndjsonJobIds.includes(job.id))
      .map(async job => {
        // Then discard data using delete queue
        const ndjsonStatus = await getNdjsonFileStatus(job.data.clientId, job.data.fileUrl);
        const jobData = {
          ndjsonStatus: ndjsonStatus
        };
        const deleteJob = await deleteQueue.createJob(jobData).save();
        logger.info(`Created delete job with id ${deleteJob.id}`);
        logger.info(`Ndjson job ${job.id} was cancelled after processing.`);
      });

    activeIds
      .filter(job => ndjsonJobIds.includes(job.id))
      .map(async job => {
        await setCancelled(job.id); //set store cancelled flag
        logger.info(`Ndjson job ${job.id} was cancelled during processing.`);
      });
  });
}

interface NDJSONJobDataType {
  fileUrl: string;
  clientId: string;
  resourceCount: number;
}

process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);

let stopping = false;
function exitHandler() {
  if (!stopping) {
    stopping = true;
    logger.info(`import-worker-${process.pid}: Import Worker Stopping`);
    process.exit();
  }
}
