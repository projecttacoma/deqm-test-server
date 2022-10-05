// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const { BulkImportWrappers } = require('bulk-data-utilities');
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

// This handler pulls down the jobs on Redis to handle
importQueue.process(async job => {
  // Payload of createJob exists on job.data
  const { clientEntry, exportURL, measureBundle, useTypeFilters } = job.data;
  logger.info(`import-worker-${process.pid}: Processing Request: ${clientEntry}`);

  await mongoUtil.client.connect();
  // Call the existing export ndjson function that writes the files
  logger.info(`import-worker-${process.pid}: Kicking off export request: ${exportURL}`);
  const result = await executePingAndPull(clientEntry, exportURL, measureBundle, useTypeFilters);
  if (result) {
    logger.info(`import-worker-${process.pid}: Enqueued jobs for: ${clientEntry}`);
  } else {
    logger.info(`import-worker-${process.pid}: Failed Import Request: ${clientEntry}`);
  }
  await mongoUtil.client.close();
});

/**
 * Calls the bulk-data-utilities wrapper function to get data requirements for the passed in measure, convert those to
 * export requests from a bulk export server, then retrieve ndjson from that server and parse it into valid transaction bundles.
 * Finally, uploads the resulting transaction bundles to the server and updates the bulkstatus endpoint
 * @param {string} clientEntryId The unique identifier which corresponds to the bulkstatus content location for update
 * @param {string} exportUrl The url of the bulk export fhir server
 * @param {string} exportType The code of the exportType
 * @param {Object} measureBundle The measure bundle for which to retrieve data requirements
 * @param {boolean} useTypeFilters optional boolean for whether to use type filters for bulk submit data
 */
const executePingAndPull = async (clientEntryId, exportUrl, exportType, measureBundle, useTypeFilters) => {
  try {
    // Default to not use typeFilters for measure specific import
    // make sure exportType makes it way to bulk data utilities
    // once that is done, deqm-test-server is done (besides deleting check exportType)
    const output = await BulkImportWrappers.executeBulkImport(
      exportUrl,
      exportType,
      measureBundle,
      useTypeFilters || false
    );
    // don't change anything beyond here
    if (output.length === 0) {
      throw new Error('Export server failed to export any resources');
    }
    // Calculate number of resources to export, if available. Otherwise, set to -1.
    const resourceCount = output.reduce((resources, fileInfo) => {
      if (resources === -1 || fileInfo.count === undefined) {
        return -1;
      }
      return resources + fileInfo.count;
    }, 0);

    await initializeBulkFileCount(clientEntryId, output.length, resourceCount);

    // Enqueue a parsing job for each ndjson file
    await ndjsonQueue.saveAll(
      output.map(locationInfo =>
        ndjsonQueue.createJob({
          fileUrl: locationInfo.url,
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
