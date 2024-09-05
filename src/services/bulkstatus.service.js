const { NotFoundError, BulkStatusError } = require('../util/errorUtils');
const { getBulkImportStatus, getNdjsonFileStatus } = require('../database/dbOperations');
const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('../server/logger');

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
  let response;

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

    throw new NotFoundError(`Could not find bulk import request with id: ${clientId}`);
  }

  logger.debug(`Retrieved the following bulkStatus entry for client: ${clientId}. ${JSON.stringify(bulkStatus)}`);
  if (bulkStatus.status === 'In Progress') {
    logger.debug(`bulkStatus entry is in progress`);
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
  } else if (bulkStatus.status === 'Failed') {
    logger.debug(`bulkStatus entry is failed`);
    res.status(200);

    // Create FHIR Bundle response
    response = {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [
        {
          response: {
            status: '400',
            outcome: {
              resourceType: 'OperationOutcome',
              issue: [
                {
                  severity: 'fatal',
                  code: 'transient',
                  details: {
                    text: bulkStatus.error.message ?? "Internal System Error: '$import' request not processed."
                  }
                }
              ]
            }
          }
        }
      ]
    };

    return response;
  } else if (bulkStatus.status === 'Completed') {
    logger.debug(`bulkStatus entry is completed`);
    res.status(200);
    res.set('Expires', 'EXAMPLE_EXPIRATION_DATE');

    response = {
      resourceType: 'Bundle',
      type: 'batch-response',
      entry: [
        {
          response: {
            status: '200'
          },
          resource: {
            resourceType: 'Parameters',
            parameter: []
          }
        }
      ]
    };

    if (bulkStatus.importManifest.parameter.find(p => p.name === 'requestIdentity')) {
      response.entry[0].resource.parameter.push(
        bulkStatus.importManifest.parameter.find(p => p.name === 'requestIdentity')
      );
    }

    // check if there were any errors with the ndjson files
    if (bulkStatus.failedOutcomes.length > 0) {
      logger.debug('bulkStatus entry contains failed outcomes');

      // Go through all of the failed outcomes and add them as
      // outcomes on the Parameters resource

      for (const parameter of bulkStatus.importManifest.parameter) {
        if (parameter.name === 'input') {
          const url = parameter.part.find(p => p.name === 'url');
          const ndjsonStatus = await getNdjsonFileStatus(clientId, url.valueUrl);
          if (ndjsonStatus) {
            ndjsonStatus.failedOutcomes.forEach(fail => {
              const inputResult = {
                name: 'outcome',
                part: [
                  { name: 'associatedInputUrl', valueUrl: url.valueUrl },
                  {
                    name: 'operationOutcome',
                    resource: {
                      resourceType: 'OperationOutcome',
                      issue: [{ severity: 'error', code: 'processing', details: { text: fail } }]
                    }
                  }
                ]
              };
              response.entry[0].resource.parameter.push(inputResult);
            });
            if (ndjsonStatus.successCount) {
              const successCountResult = {
                name: 'outcome',
                part: [
                  { name: 'associatedInputUrl', valueUrl: url.valueUrl },
                  {
                    name: 'operationOutcome',
                    resource: {
                      resourceType: 'OperationOutcome',
                      issue: [
                        {
                          severity: 'information',
                          code: 'informational',
                          details: { text: `Successfully processed ${ndjsonStatus.successCount} rows.` }
                        }
                      ]
                    }
                  }
                ]
              };
              response.entry[0].resource.parameter.push(successCountResult);
            }
          }
        }
      }
    } else {
      response.entry[0].resource.parameter.push({
        name: 'outcome',
        part: [
          {
            name: 'operationOutcome',
            resource: {
              resourceType: 'OperationOutcome',
              issue: [{ severity: 'information', code: 'informational', details: { text: 'All OK' } }]
            }
          }
        ]
      });
      // create success counts for every file
      for (const parameter of bulkStatus.importManifest.parameter) {
        if (parameter.name === 'input') {
          const url = parameter.part.find(p => p.name === 'url');
          const ndjsonStatus = await getNdjsonFileStatus(clientId, url.valueUrl);
          if (ndjsonStatus?.successCount) {
            const successCountResult = {
              name: 'outcome',
              part: [
                { name: 'associatedInputUrl', valueUrl: url.valueUrl },
                {
                  name: 'operationOutcome',
                  resource: {
                    resourceType: 'OperationOutcome',
                    issue: [
                      {
                        severity: 'information',
                        code: 'informational',
                        details: { text: `Successfully processed ${ndjsonStatus.successCount} rows.` }
                      }
                    ]
                  }
                }
              ]
            };
            response.entry[0].resource.parameter.push(successCountResult);
          }
        }
      }
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
    writeToFile(JSON.parse(JSON.stringify(new OperationOutcome(outcome).toJSON())), 'OperationOutcome', clientId);

    throw new BulkStatusError(
      bulkStatus.error.message || `An unknown error occurred during bulk import with id: ${clientId}`,
      bulkStatus.error.code || 'UnknownError'
    );
  }
}

/**
 * Write object to ndjson file in tmp directory
 * @param {Object} doc representing the object that needs to be written
 * @param {string} type resource type of the object (expect OperationOutcome)
 * @param {string} clientId client id used to create identifiable file name
 */
const writeToFile = function (doc, type, clientId) {
  // Do not write if file already has contents
  if (checkForFile(type, clientId)) return;

  const dirpath = './tmp/' + clientId;
  fs.mkdirSync(dirpath, { recursive: true });
  const filename = path.join(dirpath, `${type}.ndjson`);

  let lineCount = 0;
  logger.debug(`Attempting to write the following OperationOutcome to ${filename}: ${JSON.stringify(doc)}`);

  if (Object.keys(doc).length > 0) {
    const stream = fs.createWriteStream(filename, { flags: 'a' });
    stream.write((++lineCount === 1 ? '' : '\r\n') + JSON.stringify(doc));
    stream.end();
  } else return;
};

/**
 * Uses type and clientId to check if a file already exists in tmp for those values
 * @param {string} type resource type
 * @param {*} clientId client id used to identify the file
 * @returns {boolean} true if file for type and client id exists with content
 */
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
