const { ServerError, loggers } = require('@projecttacoma/node-fhir-server-core');
const { getBulkImportStatus } = require('../database/dbOperations');
const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const logger = loggers.get('default');
/**
 * Searches for the bulkStatus entry with the passed in client id and interprets and
 * formats the information held there to return to the user
 * @param {Object} req The express request object passed in by the user
 * @param {Object} res The express response object to be returned to the user
 * @returns {Object} an object summarizing the status of the bulk data request
 */
async function checkBulkStatus(req, res) {
  const clientId = req.params.client_id;
  logger.debug(`Retrieving bulkStatus entry for client: ${clientId}`);
  const bulkStatus = await getBulkImportStatus(clientId);

  if (!bulkStatus) {
    const outcome = {};
    outcome.id = uuidv4();
    outcome.issue = [
      {
        severity: 'error',
        code: 'not-found',
        details: {
          text: `Could not find bulk import request with id: ${clientId}`
        }
      }
    ];
    const OperationOutcome = resolveSchema(req.params.base_version, 'operationoutcome');
    logger.debug(`Writing unable to find bulk import request OperationOutcome to file for client: ${clientId}`);
    // TODO: Provide this file to the user. Ideally we'd add a coding, but no codings in the vs generically indicate not found
    writeToFile(JSON.parse(JSON.stringify(new OperationOutcome(outcome).toJSON())), 'OperationOutcome', clientId);

    throw new ServerError(null, {
      statusCode: 404,
      issue: [
        {
          severity: 'error',
          code: 'NotFound',
          details: {
            text: `Could not find bulk import request with id: ${clientId}`
          }
        }
      ]
    });
  }

  if (bulkStatus.status === 'Failed') {
    throw new ServerError(null, {
      statusCode: 500,
      issue: [
        {
          severity: 'error',
          code: bulkStatus.error.code || 'UnknownError',
          details: {
            text: bulkStatus.error.message || `An unknown error occurred during bulk import with id: ${clientId}`
          }
        }
      ]
    });
  } else if (bulkStatus.status === 'In Progress') {
    res.status(202);
    // Compute percent of files or resources exported
    logger.debug(`Calculating bulkStatus percent complete for clientId: ${clientId}`);
    let percentComplete;
    // Use file counts for percentage if export server does not record resource counts
    if (bulkStatus.exportedResourceCount === -1) {
      percentComplete = (bulkStatus.totalFileCount - bulkStatus.exportedFileCount) / bulkStatus.totalFileCount;
    } else {
      percentComplete =
        (bulkStatus.totalResourceCount - bulkStatus.exportedResourceCount) / bulkStatus.totalResourceCount;
    }
    res.set('X-Progress', `${(percentComplete * 100).toFixed(2)}% Done`);
    res.set('Retry-After', 120);
  } else if (bulkStatus.status === 'Completed') {
    res.status(200);
    res.set('Expires', 'EXAMPLE_EXPIRATION_DATE');

    // Create and respond with operation outcome
    const outcome = {};
    outcome.id = uuidv4();
    outcome.issue = [
      {
        severity: 'information',
        code: 'informational',
        details: {
          coding: [
            {
              code: 'MSG_CREATED',
              display: 'New resource created'
            }
          ],
          text: `Bulk import successfully completed, successfully imported ${bulkStatus.successCount} resources`
        }
      }
    ];
    const OperationOutcome = resolveSchema(req.params.base_version, 'operationoutcome');
    logger.debug(`Writing successful OperationOutcome to file for client: ${clientId}`);
    writeToFile(JSON.parse(JSON.stringify(new OperationOutcome(outcome).toJSON())), 'OperationOutcome', clientId);

    const response = {
      transactionTime: '2021-01-01T00:00:00Z',
      requiresAccessToken: true,
      outcome: [
        {
          type: 'OperationOutcome',
          url: `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/file/${clientId}/OperationOutcome.ndjson`
        }
      ],
      extension: { 'https://example.com/extra-property': true }
    };

    if (bulkStatus.failedOutcomes.length > 0) {
      bulkStatus.failedOutcomes.forEach(fail => {
        const failOutcome = {};
        failOutcome.id = uuidv4();
        failOutcome.issue = [
          {
            severity: 'error',
            code: 'BadRequest',
            details: {
              text: fail
            }
          }
        ];
        writeToFile(JSON.parse(JSON.stringify(new OperationOutcome(failOutcome).toJSON())), 'Errors', clientId);
      });
      response.outcome.push({
        type: 'OperationOutcome',
        url: `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/file/${clientId}/Errors.ndjson`
      });
    }
    return response;
  } else {
    const outcome = {};
    outcome.id = uuidv4();
    outcome.issue = [
      {
        severity: 'error',
        code: 'exception',
        details: {
          text: bulkStatus.error.message || `An unknown error occurred during bulk import with id: ${clientId}`
        }
      }
    ];
    // TODO: Provide this file to the user. Ideally we'd add a coding, but no codings in the vs are generic enough for an unknown failure
    const OperationOutcome = resolveSchema(req.params.base_version, 'operationoutcome');
    logger.debug(`Writing OperationOutcome with failed resources to file for client: ${clientId}`);
    writeToFile(JSON.parse(JSON.stringify(new OperationOutcome(outcome).toJSON())), 'OperationOutcome', clientId);

    throw new ServerError(null, {
      statusCode: 500,
      issue: [
        {
          severity: 'error',
          code: bulkStatus.error.code || 'UnknownError',
          details: {
            text: bulkStatus.error.message || `An unknown error occurred during bulk import with id: ${clientId}`
          }
        }
      ]
    });
  }
}

const writeToFile = function (doc, type, clientId) {
  // Do not write if file already has contents
  if (checkForFile(type, clientId)) return;

  const dirpath = './tmp/' + clientId;
  fs.mkdirSync(dirpath, { recursive: true });
  const filename = path.join(dirpath, `${type}.ndjson`);

  let lineCount = 0;

  if (Object.keys(doc).length > 0) {
    const stream = fs.createWriteStream(filename, { flags: 'a' });
    stream.write((++lineCount === 1 ? '' : '\r\n') + JSON.stringify(doc));
    stream.end();
  } else return;
};

// true if file for type and client id exists with content
const checkForFile = function (type, clientId) {
  const dirpath = './tmp/' + clientId;
  const filename = path.join(dirpath, `${type}.ndjson`);
  // check file exists and has contents
  try {
    if (fs.existsSync(filename)) {
      //file exists
      const data = fs.readFileSync(filename);
      return data.length !== 0;
    }
  } catch (err) {
    return false;
  }
  return false;
};

module.exports = { checkBulkStatus };
