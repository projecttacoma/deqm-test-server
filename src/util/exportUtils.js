const { ServerError } = require('@projecttacoma/node-fhir-server-core');

/**
 * Uses request body parameter to search for the export server URL. Validates that
 * only one URL is present.
 * @param {Object} parameters - request body parameter
 * @returns export server URL string
 */
const retrieveExportURL = parameters => {
  const exportURLArray = parameters.filter(param => param.name === 'exportURL');
  checkExportURLArray(exportURLArray);
  const exportURL = exportURLArray[0].valueString;
  return exportURL;
};

/**
 * Checks whether the export URL array contains exactly one exportURL
 * @param {Array} exportURLArray array of export URLs provided in request
 */
const checkExportURLArray = exportURLArray => {
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
  // if one export URL exists, check that value string exists
  if (!exportURLArray[0].valueString) {
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
};

module.exports = { retrieveExportURL };
