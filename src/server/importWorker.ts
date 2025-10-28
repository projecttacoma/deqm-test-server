// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
import Queue from 'bee-queue';
import { failBulkImportRequest, initializeBulkFileCount } from '../database/dbOperations';
import { client } from '../database/connection';
import ndjsonQueue from '../queue/ndjsonProcessQueue';
import logger from './logger';

logger.info(`import-worker-${process.pid}: Import Worker Started!`);
const importQueue = new Queue('import', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

// TODO: Update using bee-queue types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
importQueue.process(async (job: any) => {
  // Payload of createJob exists on job.data
  const { clientEntry, inputUrls } = job.data;
  logger.info(`import-worker-${process.pid}: Processing Request: ${clientEntry}`);

  await client.connect();
  // Call function to get the ndjson files
  const result = await executeImportWorkflow(clientEntry, inputUrls);
  if (result) {
    logger.info(`import-worker-${process.pid}: Enqueued jobs for: ${clientEntry}`);
  } else {
    logger.info(`import-worker-${process.pid}: Failed Import Request: ${clientEntry}`);
  }
  await client.close();
});

const executeImportWorkflow = async (clientEntryId: string, inputUrls: string[]) => {
  try {
    await initializeBulkFileCount(clientEntryId, inputUrls.length, -1);

    // Enqueue a parsing job for each ndjson file
    await ndjsonQueue.saveAll(
      inputUrls.map(url =>
        ndjsonQueue.createJob({
          fileUrl: url,
          clientId: clientEntryId,
          resourceCount: -1
        })
      )
    );
    return true;
  } catch (e) {
    if (e instanceof Error) {
      await failBulkImportRequest(clientEntryId, e);
      return false;
    }
  }
};

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
