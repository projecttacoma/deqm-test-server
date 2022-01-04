const { ServerError } = require('@projecttacoma/node-fhir-server-core');
const { getBulkImportStatus } = require('../database/dbOperations');
const { createResource, findResourceById } = require('../database/dbOperations');
const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

/**
 * Searches for the bulkStatus entry with the passed in client id and interprets and
 * formats the information held there to return to the user
 * @param {Object} req The express request object passed in by the user
 * @param {Object} res The express response object to be returned to the user
 * @returns {Object} an object summarizing the status of the bulk data request
 */
async function checkBulkStatus(req, res) {
  const clientId = req.params.client_id;

  const bulkStatus = await getBulkImportStatus(clientId);

  if (!bulkStatus) {
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
  if (bulkStatus.status === 'In Progress') {
    res.status(202);
    //TODO set these responses dynamically?
    res.set('X-Progress', 'Retrieving export files');
    res.set('Retry-After', 120);
  } else if (bulkStatus.status === 'Completed') {
    res.status(200);
    res.set('Expires', 'EXAMPLE_EXPIRATION_DATE');

    // Create and respond with operation outcome
    const outcome = {};
    outcome.id = uuidv4();
    const OperationOutcome = resolveSchema(req.params.base_version, 'operationoutcome');
   // http://www.hl7.org/fhir/operationoutcome.html
    // could add useful metadata from the import operation in the text of the operation outcome (number of resources, resource types, etc)
    // would need to be added to the status field in dbOperations 151
    // TODO: Update text/div
    outcome.text = {
      status: 'generated',
      div: '<div xmlns="http://www.w3.org/1999/xhtml">\n      <p>The code &quot;W&quot; is not known and not legal Patient.gender.</p>\n    </div>'
    };
    outcome.issue = [];
    await createResource(JSON.parse(JSON.stringify(new OperationOutcome(outcome).toJSON())), 'OperationOutcome');

    // TODO: ensure this works properly
    const doc = await findResourceById(outcome.id, 'OperationOutcome');
    writeToFile(doc, 'OperationOutcome', clientId)
    
    return {
      transactionTime: '2021-01-01T00:00:00Z',
      requiresAccessToken: true,
      outcome: [
        {
          type: 'OperationOutcome',
          url: `http://${process.env.HOST}:${process.env.PORT}/${req.params.base_version}/${clientId}/OperationOutcome.ndjson`
        }
      ],
      extension: { 'https://example.com/extra-property': true }
    };
  } else {
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

module.exports = { checkBulkStatus };
