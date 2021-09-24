const { ServerError } = require('@asymmetrik/node-fhir-server-core');

// eslint-disable-next-line no-unused-vars
async function checkBulkStatus(req, res) {
  throw new ServerError(null, {
    statusCode: 501,
    issue: [
      {
        severity: 'error',
        code: 'NotImplemented',
        details: {
          text: `bulkImport has not been implemented yet`
        }
      }
    ]
  });
}

module.exports = { checkBulkStatus };
