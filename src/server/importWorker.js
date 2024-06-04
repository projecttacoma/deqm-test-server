// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const { failBulkImportRequest, initializeBulkFileCount } = require('../database/dbOperations');
const mongoUtil = require('../database/connection');
const ndjsonQueue = require('../queue/ndjsonProcessQueue');
const logger = require('./logger');

logger.info(`import-worker-${process.pid}: Import Worker Started!`);
const importQueue = new Queue('import', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

// New
importQueue.process(async job => {
  // Payload of createJob exists on job.data
  const { clientEntry, exportURLs } = job.data;
  logger.info(`import-worker-${process.pid}: Processing Request: ${clientEntry}`);

  await mongoUtil.client.connect();
  // Call function to get the ndjson files
  const result = await executeNewImportWorkflow(clientEntry, exportURLs);
  if (result) {
    logger.info(`import-worker-${process.pid}: Enqueued jobs for: ${clientEntry}`);
  } else {
    logger.info(`import-worker-${process.pid}: Failed Import Request: ${clientEntry}`);
  }
  await mongoUtil.client.close();
});

const executeNewImportWorkflow = async (clientEntryId, exportURLs) => {
  try {
    if (exportURLs.length === 0) {
      throw new Error('Export server failed to export any resources');
    }

    // Calculate number of resources to export, if available. Otherwise, set to -1.
    const resourceCount = exportURLs.reduce((resources, fileInfo) => {
      if (resources === -1 || fileInfo.count === undefined) {
        return -1;
      }
      return resources + fileInfo.count;
    }, 0);

    await initializeBulkFileCount(clientEntryId, exportURLs.length, resourceCount);

    // Enqueue a parsing job for each ndjson file
    await ndjsonQueue.saveAll(
      exportURLs.map(url =>
        ndjsonQueue.createJob({
          fileUrl: url.url,
          clientId: clientEntryId,
          resourceCount: resourceCount === -1 ? -1 : locationInfo.count
        })
      )
    );
    return true;
  } catch (e) {
    await failBulkImportRequest(clientEntryId, e);
    return false;
  }
};
