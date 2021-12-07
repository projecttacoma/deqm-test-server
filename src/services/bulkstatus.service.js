const { ServerError } = require('@projecttacoma/node-fhir-server-core');
const { getBulkImportStatus } = require('../database/dbOperations');

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

    //TODO: replace this once we have asymmetrik fork
    res.status = () => res;
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

module.exports = { checkBulkStatus };
