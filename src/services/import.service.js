const { addPendingBulkImportRequest } = require('../database/dbOperations');
const { retrieveExportUrl } = require('../util/exportUtils');
const { checkExportType } = require('../util/operationValidationUtils');
const importQueue = require('../queue/importQueue');
const logger = require('../server/logger');

/**
 * Executes an import of all the resources on the passed in server.
 * @param {Object} req The request object passed in by the client
 * @param {Object} res The response object returned to the client by the server
 */
async function bulkImport(req, res) {
  logger.info('Base >>> $import');
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  logger.debug(`Request params: ${JSON.stringify(req.params)}`);

  // ID assigned to the requesting client
  const clientEntry = await addPendingBulkImportRequest();

  checkExportType(req.body.parameter);
  const exportURL = retrieveExportUrl(req.body.parameter);

  const jobData = {
    clientEntry,
    exportURL
  };
  await importQueue.createJob(jobData).save();
  res.status(202);
  res.setHeader(
    'Content-Location',
    `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/bulkstatus/${clientEntry}`
  );
  return;
}

module.exports = { bulkImport };
