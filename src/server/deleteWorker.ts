//@ts-nocheck
// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const { getBulkImportStatus, removeResource } = require('../database/dbOperations');
const mongoUtil = require('../database/connection');
import logger from './logger';

logger.info(`delete-worker-${process.pid}: delete Worker Started!`);
const deleteWorker = new Queue('delete', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

// This handler pulls down the jobs on Redis to handle
deleteWorker.process(async job => {
  const { manifestId } = job.data;
  const cancelledBulkImport = await getBulkImportStatus(manifestId);
  logger.info(`delete-worker-${process.pid}: processing manifest ${manifestId} deletion`);

  await mongoUtil.client.connect();
  const deletePromises = cancelledBulkImport.successfulResources.map(async resource => {
    const deleteResult = await removeResource(resource.resourceId, resource.resourceType);
    if (deleteResult.deletedCount === 0) {
      // TODO: should this be captured as a status failure? (return false)
      throw new Error(`Failed to delete resource ${resource.resourceType}/${resource.resourceId}`);
    }
  });

  await Promise.all(deletePromises);
  await mongoUtil.client.close();
  logger.info(`delete-worker-${process.pid}: finished processing manifest ${manifestId} deletion`);

  return true;
});

process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);

let stopping = false;
function exitHandler() {
  if (!stopping) {
    stopping = true;
    logger.info(`delete-worker-${process.pid}: delete Worker Stopping`);
    process.exit();
  }
}
