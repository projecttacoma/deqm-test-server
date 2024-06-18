const { addPendingBulkImportRequest, failBulkImportRequest } = require('../database/dbOperations');
const { retrieveInputUrls } = require('../util/exportUtils');
const importQueue = require('../queue/importQueue');
const logger = require('../server/logger');

/**
 * Executes an import of all the resources on the passed in server.
 * @param {Object} req The request object passed in by the client
 * @param {Object} res The response object returned to the client by the server
 */
async function bulkImport(req, res) {
  logger.info('Base >>> Import');
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  logger.debug(`Request params: ${JSON.stringify(req.params)}`);

  // ID assigned to the requesting client
  const clientEntry = await addPendingBulkImportRequest(req.body);

  try {
    const inputUrls = retrieveInputUrls(req.body.parameter);

    const jobData = {
      clientEntry,
      inputUrls
    };
    await importQueue.createJob(jobData).save();
  } catch (e) {
    await failBulkImportRequest(clientEntry, e);
  }

  res.status(202);
  res.setHeader(
    'Content-Location',
    `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/bulkstatus/${clientEntry}`
  );
  return;
}

module.exports = { bulkImport };
