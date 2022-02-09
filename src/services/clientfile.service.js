const { ServerError, loggers } = require('@projecttacoma/node-fhir-server-core');
const fs = require('fs');
const path = require('path');

const logger = loggers.get('default');
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
    throw new ServerError(null, {
      statusCode: 404,
      issue: [
        {
          severity: 'error',
          code: 'not-found',
          details: {
            text: `The following file was not found: ${clientId}/${fileName}`
          }
        }
      ]
    });
  }
}

module.exports = { getClientFile };
