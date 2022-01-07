const { ServerError } = require('@projecttacoma/node-fhir-server-core');
const { getBulkImportStatus, completeBulkImportRequest } = require('../database/dbOperations');

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

  if (bulkStatus.status === 'Error') {
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
    //TODO set these responses dynamically?
    res.set('X-Progress', 'Retrieving export files');
    res.set('Retry-After', 120);
  } else if (bulkStatus.status === 'Completed') {
    res.status(200);
    res.set('Expires', 'EXAMPLE_EXPIRATION_DATE');
    //TODO: Fill all this in with actual response data. Example data for now.
    return {
      transactionTime: '2021-01-01T00:00:00Z',
      requiresAccessToken: true,
      outcome: [
        {
          type: 'OperationOutcome',
          url: 'https://example.com/output/info_file_1.ndjson'
        }
      ],
      extension: { 'https://example.com/extra-property': true }
    };
  }
}

module.exports = { checkBulkStatus };
