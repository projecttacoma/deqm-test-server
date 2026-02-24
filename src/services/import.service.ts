import {
  addPendingBulkImportRequest,
  cancelBulkImport,
  createBulkSubmissionStatus,
  failBulkImportRequest,
  getBulkImportStatus,
  getBulkSubmissionStatus,
  updateSubmissionStatus,
  // findNdjsonStatusbyJob,
  getNdjsonFileStatus
} from '../database/dbOperations';
import { createManifestHash } from '../util/baseUtils';
import axios from 'axios';
import { importQueue } from '../queue/importQueue';
import { AxiosError } from 'axios';
import logger from '../server/logger';
import { ExportManifest, pushImportJob } from '../database/dbOperations';
import { BadRequestError, InternalError, ResourceNotFoundError } from '../util/errorUtils';
import ndjsonQueue from '../queue/ndjsonProcessQueue';
import { deleteQueue } from '../queue/deleteQueue';
import { setCancelled } from '../server/redisClient';
import { Job } from 'bee-queue';

/**
 * Executes an import of all the resources on the passed in server.
 * @param {Object} req The request object passed in by the client
 * @param {Object} res The response object returned to the client by the server
 */
// TODO: update with relevant types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bulkImport(req: any, res: any) {
  logger.info('Base >>> Import');
  logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  logger.debug(`Request params: ${JSON.stringify(req.params)}`);

  if (!req.body || req.body.resourceType !== 'Parameters') {
    throw new BadRequestError('Did not receive "Parameters" object as part of request body');
  }
  const parameters = req.body as fhir4.Parameters;
  const submitter = parameters.parameter?.find(p => p.name === 'submitter')?.valueIdentifier as
    | fhir4.Identifier
    | undefined;
  const submissionId = parameters.parameter?.find(p => p.name === 'submissionId')?.valueString;
  const manifestUrl = parameters.parameter?.find(p => p.name === 'manifestUrl')?.valueString;
  const baseUrl = parameters.parameter?.find(p => p.name === 'fhirBaseUrl')?.valueString;
  const submissionStatus = parameters.parameter?.find(p => p.name === 'submissionStatus')?.valueCoding;
  const replacesManifestUrl = parameters.parameter?.find(p => p.name === 'replacesManifestUrl')?.valueString;
  if (!submitter?.value) {
    throw new BadRequestError('Request must include a submitter parameter with a value.');
  }
  if (!submissionId) {
    throw new BadRequestError('Request must include a submissionId parameter.');
  }
  if (!manifestUrl) {
    if (submissionStatus?.code && (submissionStatus.code === 'complete' || submissionStatus.code === 'aborted')) {
      await updateSubmissionStatus(submitter, submissionId, submissionStatus.code);

      // exit early because there is no manifest to process
      res.status(200);
      return;
    } else {
      throw new BadRequestError('Request must include a manifestUrl parameter or appropriate submission status.');
    }
  }
  if (!baseUrl) {
    throw new BadRequestError('Request must include a fhirBaseUrl parameter.');
  }

  let bulkSubmissionStatus = await getBulkSubmissionStatus(submitter.value, submissionId);
  if (bulkSubmissionStatus?.status === 'aborted' || bulkSubmissionStatus?.status === 'complete') {
    throw new BadRequestError(
      `Request applies a submission update to existing ${bulkSubmissionStatus?.status} submission`
    );
  }
  if (!bulkSubmissionStatus) {
    bulkSubmissionStatus = await createBulkSubmissionStatus(submitter, submissionId, submissionStatus);
  } else if (submissionStatus?.code === 'complete' || submissionStatus?.code === 'aborted') {
    // Update submission status to prevent any further incoming requests
    await updateSubmissionStatus(submitter, submissionId, submissionStatus.code);
  }

  let manifest: ExportManifest;
  try {
    manifest = (await axios.get(manifestUrl))?.data;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const error = e as AxiosError;
      throw new ResourceNotFoundError(
        `Was unable to resolve manifest url ${manifestUrl}. Received error: ${error.message}`
      );
    } else if (e instanceof Error) {
      // Unexpected error
      throw new InternalError(
        `Unexpected failed retrieval of manifest at ${manifestUrl} with error message: ${e.message}`
      );
    } else {
      throw e;
    }
  }

  // handle manifest url replacement
  if (replacesManifestUrl) {
    const manifestId = createManifestHash(bulkSubmissionStatus.id, replacesManifestUrl);
    const existingBulkImportRequest = await getBulkImportStatus(manifestId);
    if (!existingBulkImportRequest) {
      throw new BadRequestError(`Unable to find status for manifest specified for replacement: ${replacesManifestUrl}`);
    } else {
      // Update import status
      const jobInformation = await cancelBulkImport(manifestId);
      // stop jobs
      await stopJobs(jobInformation);
    }
  }

  const manifestEntry = await addPendingBulkImportRequest(manifest, bulkSubmissionStatus.id, manifestUrl, baseUrl);
  try {
    const inputUrls = manifest.output.map(o => o.url);

    const jobData = {
      manifestEntry,
      inputUrls
    };
    const createdJob = await importQueue.createJob(jobData).save();
    await pushImportJob(manifestEntry, createdJob.id);
    logger.debug(`Created job with id ${createdJob.id}`);
  } catch (e) {
    if (e instanceof Error) {
      // This creates a failed status -> should we return a 500 here instead/as well?
      await failBulkImportRequest(manifestEntry, e);
      throw new InternalError(
        `Failed job creation for clientEntry ${submitter.value}-${submissionId} using manifest url ${manifestUrl} with error message: ${e.message}`
      );
    } else {
      throw e;
    }
  }

  res.status(200);
  return;
}
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

  logger.info(`Ndjson job ids: ${ndjsonJobIds.join(', ')}`);
  // logger.info(`Check health: ${await ndjsonQueue.checkHealth()}`);
  const counts = await ndjsonQueue.checkHealth();
  console.log('job state counts:', counts);
  logger.info(
    await Promise.all(
      ndjsonJobIds.map(async jobId => {
        const job = await ndjsonQueue.getJob(jobId);
        return `Job with id ${job.id} has status ${job.status}`;
      })
    )
  );

  // TODO: page size defaults to 100
  // TODO: make sure there isn't a race between the following logic
  ndjsonQueue.getJobs('waiting').then((jobs: Job<NDJSONJobDataType>[]) => {
    jobs
      .filter(job => ndjsonJobIds.includes(job.id))
      .map(async job => {
        await job.remove();
        logger.info(`Ndjson job ${job.id} was cancelled from waiting before processing.`);
      });
  });
  ndjsonQueue.getJobs('delayed').then((jobs: Job<NDJSONJobDataType>[]) => {
    jobs
      .filter(job => ndjsonJobIds.includes(job.id))
      .map(async job => {
        await job.remove();
        logger.info(`Ndjson job ${job.id} was cancelled from delayed before processing.`);
      });
  });
  ndjsonQueue.getJobs('failed').then((jobs: Job<NDJSONJobDataType>[]) => {
    jobs
      .filter(job => ndjsonJobIds.includes(job.id))
      .map(async job => {
        // Then discard data using delete queue
        const ndjsonStatus = await getNdjsonFileStatus(job.data.clientId, job.data.fileUrl);
        const jobData = {
          ndjsonStatus: ndjsonStatus
        };
        const deleteJob = await deleteQueue.createJob(jobData).save();
        logger.info(`Created delete job with id ${deleteJob.id}`);
        logger.info(`Ndjson job ${job.id} was cancelled after failed processing.`);
      });
  });
  ndjsonQueue.getJobs('succeeded').then((jobs: Job<NDJSONJobDataType>[]) => {
    jobs
      .filter(job => ndjsonJobIds.includes(job.id))
      .map(async job => {
        // Then discard data using delete queue
        const ndjsonStatus = await getNdjsonFileStatus(job.data.clientId, job.data.fileUrl);
        const jobData = {
          ndjsonStatus: ndjsonStatus
        };
        const deleteJob = await deleteQueue.createJob(jobData).save();
        logger.info(`Created delete job with id ${deleteJob.id}`);
        logger.info(`Ndjson job ${job.id} was cancelled after successful processing.`);
      });
  });
  ndjsonQueue.getJobs('active').then((jobs: Job<NDJSONJobDataType>[]) => {
    jobs
      .filter(job => ndjsonJobIds.includes(job.id))
      .map(async job => {
        await setCancelled(job.id); //set store cancelled flag
        logger.info(`Ndjson job ${job.id} was cancelled during processing.`);
      });
  });

  // cancel and do rollback according to state
  // await Promise.all(
  //   ndjsonJobIds.map(async jobId => {
  //     const job = await ndjsonQueue.getJob(jobId);
  //     if (!job) {
  //       throw Error('TODO: This is a problem right, or does it just mean it has been removed from the queue?');
  //     }

  //     // // TODO: make sure state doesn't change before if checks
  //     let state;
  //     if (await job.isInSet('waiting')){
  //       state = 'waiting'
  //     }
  //     logger.info(`Job state for ${jobId} is ${state}`);
  //     if (['waiting', 'delayed', 'stalled'].includes(state)) {
  //       await job.remove();
  //       logger.info(`Ndjson job ${jobId} was cancelled before processing.`);
  //     } else if (['failed', 'succeeded'].includes(state)) {
  //       // Then discard data using delete queue
  //       // TODO: can probably do this using the job data instead
  //       const ndjsonStatus = await findNdjsonStatusbyJob(jobId);
  //       const jobData = {
  //         ndjsonStatus: ndjsonStatus
  //       };
  //       const deleteJob = await deleteQueue.createJob(jobData).save();
  //       logger.info(`Created delete job with id ${deleteJob.id}`);
  //       logger.info(`Ndjson job ${jobId} was cancelled after processing.`);
  //     } else if (state === 'active') {
  //       await setCancelled(jobId); //set store cancelled flag
  //       logger.info(`Ndjson job ${jobId} was cancelled during processing.`);
  //     }
  //   })
  // );
}

interface NDJSONJobDataType {
  fileUrl: string;
  clientId: string;
  resourceCount: number;
}

module.exports = { bulkImport };
