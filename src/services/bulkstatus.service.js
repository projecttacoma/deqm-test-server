const { ServerError } = require('@asymmetrik/node-fhir-server-core');
const { getBulkImportStatus } = require('../util/mongo.controller');

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
  if (bulkStatus.status === 'Pending') {
    res.status(202);
    //TODO: replace this once we have asymmetrik fork
    res.status = () => res;
  } else if (bulkStatus.status === 'Completed') {
    res.status(200);
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
  return { id: clientId, status: bulkStatus.status };
}

module.exports = { checkBulkStatus };
