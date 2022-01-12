// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const { BulkImportWrappers } = require('bulk-data-utilities');
const { failBulkImportRequest, initializeBulkFileCount } = require('../database/dbOperations');
const mongoUtil = require('../database/connection');
const ndjsonQueue = require('../queue/ndjsonProcessQueue');

console.log(`import-worker-${process.pid}: Import Worker Started!`);
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
  const { clientEntry, exportURL, measureBundle } = job.data;
  console.log(`import-worker-${process.pid}: Processing Request: ${clientEntry}`);

  await mongoUtil.client.connect();
  // Call the existing export ndjson function that writes the files
  const result = await executePingAndPull(clientEntry, exportURL, measureBundle);
  if (result) {
    console.log(`import-worker-${process.pid}: Enqueued jobs for: ${clientEntry}`);
  } else {
    console.log(`import-worker-${process.pid}: Failed Import Request: ${clientEntry}`);
  }
  await mongoUtil.client.close();
});

/**
 * Calls the bulk-data-utilities wrapper function to get data requirements for the passed in measure, convert those to
 * export requests from a bulk export server, then retrieve ndjson from that server and parse it into valid transaction bundles.
 * Finally, uploads the resulting transaction bundles to the server and updates the bulkstatus endpoint
 * @param {string} clientEntryId The unique identifier which corresponds to the bulkstatus content location for update
 * @param {string} exportUrl The url of the bulk export fhir server
 * @param {Object} measureBundle The measure bundle for which to retrieve data requirements
 */
const executePingAndPull = async (clientEntryId, exportUrl, measureBundle) => {
  try {
    const output = await BulkImportWrappers.executeBulkImport(exportUrl, measureBundle);

    // If any files dont have count data, just track percentage based on number of files
    const resourceCount = output.reduce((resources, fileInfo) => {
      if (resources === -1 || fileInfo.count === undefined) {
        return -1;
      }
      // count of resources is available
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
