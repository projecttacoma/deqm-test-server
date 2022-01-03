// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const { BulkImportWrappers } = require('bulk-data-utilities');
const { failBulkImportRequest, completeBulkImportRequest } = require('../database/dbOperations');
const { uploadResourcesFromBundle } = require('../services/bundle.service');
const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const mongoUtil = require('../database/connection');

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
  const { clientEntry, exportURL, requestInfo, measureBundle } = job.data;
  console.log(`import-worker-${process.pid}: Processing Request: ${clientEntry}`);
  await mongoUtil.client.connect();
  // Call the existing export ndjson function that writes the files
  const result = await executePingAndPull(clientEntry, exportURL, requestInfo, measureBundle);
  if (result) {
    console.log(`import-worker-${process.pid}: Completed Import Request: ${clientEntry}`);
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
 * @param {Object} req The request object passed in by the user
 */

const executePingAndPull = async (clientEntryId, exportUrl, { headers, baseUrl, params, protocol }, measureBundle) => {
  try {
    const transactionBundles = await BulkImportWrappers.executeBulkImport(exportUrl, clientEntryId, measureBundle);
    const baseVersion = params.base_version;
    const pendingTransactionBundles = transactionBundles.map(async tb => {
      const tbTemplate = resolveSchema(baseVersion, 'bundle');
      // Check upload succeeds
      tb = new tbTemplate(tb).toJSON();
      return uploadResourcesFromBundle(tb.entry, headers, baseUrl, baseVersion, protocol, false);
    });
    await Promise.all(pendingTransactionBundles);
    await completeBulkImportRequest(clientEntryId);
    return true;
  } catch (e) {
    await failBulkImportRequest(clientEntryId, e);
    return false;
  }
};
