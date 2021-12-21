const { addPendingBulkImportRequest } = require('../database/dbOperations');
const { retrieveExportURL } = require('../util/measureOperationsUtils');
const { loggers } = require('@projecttacoma/node-fhir-server-core');

const logger = loggers.get('default');
const _ = require('lodash');
const importQueue = require('../resources/importQueue');

/**
 * Executes an import of all the resources on the passed in server.
 * @param {Object} req The request object passed in by the client
 * @param {Object} res The response object returned to the client by the server
 */
async function bulkImport(req, res) {
  logger.info('Measure >>> $bulk-import');
  // ID assigned to the requesting client
  const clientEntry = await addPendingBulkImportRequest();
  const exportURL = retrieveExportURL(req.body.parameter);
  const requestInfo = _.pick(req, 'params', 'body', 'headers', 'protocol', 'baseUrl');

  const jobData = {
    clientEntry,
    exportURL,
    requestInfo
  };
  await importQueue.createJob(jobData).save();
  res.status(202);
  res.setHeader('Content-Location', `${req.params.base_version}/bulkstatus/${clientEntry}`);

  return;
}

module.exports = { bulkImport };
