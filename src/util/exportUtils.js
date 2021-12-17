const { ServerError } = require('@projecttacoma/node-fhir-server-core');

/**
 * Uses request body parameter to search for the export server URL. Validates that
 * only one URL is present.
 * @param {Object} parameters - request body parameter
 * @returns export server URL string
 */
const retrieveExportURL = parameters => {
  const exportURLArray = parameters.filter(param => param.name === 'exportURL');
  if (exportURLArray.length === 0) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `No exportURL parameter was found.`
          }
        }
      ]
    });
  }
  if (exportURLArray.length !== 1) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected exactly one export URL. Received: ${exportURLArray.length}`
          }
        }
      ]
    });
  }
  const exportURL = exportURLArray[0].valueString;
  if (!exportURL) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected a valueString for the exportURL, but none was found`
          }
        }
      ]
    });
  }
  return exportURL;
};

module.exports = { retrieveExportURL };
