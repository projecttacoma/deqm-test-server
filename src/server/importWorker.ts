//@ts-nocheck
// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const { failBulkImportRequest, initializeBulkFileCount } = require('../database/dbOperations');
const mongoUtil = require('../database/connection');
const ndjsonQueue = require('../queue/ndjsonProcessQueue');
import logger from './logger';

logger.info(`import-worker-${process.pid}: Import Worker Started!`);
const importQueue = new Queue('import', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

importQueue.process(async job => {
  // Payload of createJob exists on job.data
  const { clientEntry, inputUrls } = job.data;
  logger.info(`import-worker-${process.pid}: Processing Request: ${clientEntry}`);

  await mongoUtil.client.connect();
  // Call function to get the ndjson files
  const result = await executeImportWorkflow(clientEntry, inputUrls);
  if (result) {
    logger.info(`import-worker-${process.pid}: Enqueued jobs for: ${clientEntry}`);
  } else {
    logger.info(`import-worker-${process.pid}: Failed Import Request: ${clientEntry}`);
  }
  await mongoUtil.client.close();
});

const executeImportWorkflow = async (clientEntryId, inputUrls) => {
  try {
    await initializeBulkFileCount(clientEntryId, inputUrls.length, -1);

    // Enqueue a parsing job for each ndjson file
    await ndjsonQueue.saveAll(
      inputUrls.map(url =>
        ndjsonQueue.createJob({
          fileUrl: url.url,
          clientId: clientEntryId,
          resourceCount: -1
        })
      )
    );
    return true;
  } catch (e) {
    await failBulkImportRequest(clientEntryId, e);
    return false;
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
