//@ts-nocheck
const { NotFoundError } = require('../util/errorUtils');
const fs = require('fs');
const path = require('path');

const logger = require('../server/logger');
/**
 * Finds and responds with requested file for some client id
 * @param {Object} req The express request object passed in by the user
 * @param {Object} res The express response object to be returned to the user
 * @returns {Object} file content
 */
async function getClientFile(req, res) {
  const clientId = req.params.clientId;
  const fileName = req.params.fileName;
  logger.info(`Retrieving ${fileName} file for client: ${clientId} `);
  const filePath = `tmp/${clientId}/${fileName}`;
  if (fs.existsSync(filePath)) {
    res.status(200);
    res.set('Content-Type', 'application/ndjson+fhir');
    return path.resolve(`./tmp/${clientId}/${fileName}`);
  } else {
    throw new NotFoundError(`The following file was not found: ${clientId}/${fileName}`);
  }
}

module.exports = { getClientFile };
