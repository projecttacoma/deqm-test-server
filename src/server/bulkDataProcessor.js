// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const { BulkImportWrappers } = require('bulk-data-utilities');
const { failBulkImportRequest, completeBulkImportRequest } = require('../database/dbOperations');
const { uploadResourcesFromBundle } = require('../services/bundle.service');
const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const mongoUtil = require('../database/connection');

console.log('Bulk Data Processor Connected!');
const importQueue = new Queue('import', {
  removeOnSuccess: true
});

// This handler pulls down the jobs on Redis to handle
importQueue.process(async job => {
  await mongoUtil.client.connect();
  // Payload of createJob exists on job.data
  const { clientEntry, exportURL, requestInfo, measureBundle } = job.data;
  // Call the existing export ndjson function that writes the files
  await executePingAndPull(clientEntry, exportURL, requestInfo, measureBundle);
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
    const transactionBundles = await BulkImportWrappers.executeBulkImport(
      exportUrl,
      clientEntryId,
      measureBundle
    ).catch(async e => {
      await failBulkImportRequest(clientEntryId, e);
    });
    const baseVersion = params.base_version;
    const pendingTransactionBundles = transactionBundles.map(async tb => {
      const tbTemplate = resolveSchema(baseVersion, 'bundle');
      // Check upload succeeds
      tb = new tbTemplate(tb).toJSON();
      return uploadResourcesFromBundle(tb.entry, headers, baseUrl, baseVersion, protocol, false);
    });
    await Promise.all(pendingTransactionBundles);
    await completeBulkImportRequest(clientEntryId);
  } catch (e) {
    await failBulkImportRequest(clientEntryId, e);
  }
};
