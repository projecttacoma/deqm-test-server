const { BulkImportWrappers } = require('bulk-data-utilities');
const {
  failBulkImportRequest,
  completeBulkImportRequest,
  addPendingBulkImportRequest
} = require('../database/dbOperations');
const { retrieveExportURL } = require('../util/measureOperationsUtils');
const { loggers } = require('@projecttacoma/node-fhir-server-core');
const { handleSubmitDataBundles } = require('./bundle.service');

const logger = loggers.get('default');

/**
 * Executes an import of all the resources on the passed in server.
 * @param {Object} req The request object passed in by the client
 * @param {Object} res The response object returned to the client by the server
 */
async function bulkImport(req, res) {
  logger.info('Measure >>> $bulk-import');
  // ID assigned to the requesting client
  const clientEntry = await addPendingBulkImportRequest();
  const parameters = req.body.parameter;
  const exportURL = retrieveExportURL(parameters);
  //When we move to a job queue, remove --forceExist from test script in package.json
  executePingAndPull(clientEntry, exportURL, req);
  res.status(202);
  res.setHeader('Content-Location', `${req.params.base_version}/bulkstatus/${clientEntry}`);

  return;
}

/**
 * Calls the bulk-data-utilities wrapper function to get data requirements for the passed in measure, convert those to
 * export requests from a bulk export server, then retrieve ndjson from that server and parse it into valid transaction bundles.
 * Finally, uploads the resulting transaction bundles to the server and updates the bulkstatus endpoint
 * @param {string} clientEntryId The unique identifier which corresponds to the bulkstatus content location for update
 * @param {string} exportUrl The url of the bulk export fhir server
 * @param {Object} measureBundle The measure bundle for which to retrieve data requirements
 * @param {Object} req The request object passed in by the user
 */

const executePingAndPull = async (clientEntryId, exportUrl, req, measureBundle) => {
  try {
    const transactionBundles = await BulkImportWrappers.executeBulkImport(
      exportUrl,
      clientEntryId,
      measureBundle
    ).catch(async e => {
      await failBulkImportRequest(clientEntryId, e);
    });
    const pendingTransactionBundles = await handleSubmitDataBundles(transactionBundles, req);
    await Promise.all(pendingTransactionBundles);

    await completeBulkImportRequest(clientEntryId);
  } catch (e) {
    await failBulkImportRequest(clientEntryId, e);
  }
};

module.exports = { bulkImport, executePingAndPull };
