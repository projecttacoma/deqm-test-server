const { ServerError } = require('@projecttacoma/node-fhir-server-core');

/**
 * Uses request body parameter to search for the export server URL. Validates that
 * only one URL is present.
 * @param {Object} parameters - request body parameter
 * @returns export server URL string
 */
const retrieveExportUrl = parameters => {
  const exportUrlArray = parameters.filter(param => param.name === 'exportUrl');
  checkExportUrlArray(exportUrlArray);
  const exportUrl = exportUrlArray[0].valueString;

  // Retrieve comma-delimited list of type filters from parameters
  const typesString = parameters
    .filter(param => param.name === '_type')
    .map(function (type) {
      return type.valueString;
    })
    .toString();

  const exportUrlWithParams = `${exportUrl}?_type=${typesString}`;
  return exportUrlWithParams;
};

/**
 * Checks whether the export URL array contains exactly one exportUrl
 * @param {Array} exportUrlArray array of export URLs provided in request
 */
const checkExportUrlArray = exportUrlArray => {
  if (exportUrlArray.length === 0) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `No exportUrl parameter was found.`
          }
        }
      ]
    });
  }
  if (exportUrlArray.length !== 1) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected exactly one export URL. Received: ${exportUrlArray.length}`
          }
        }
      ]
    });
  }
  // if one export URL exists, check that value string exists
  if (!exportUrlArray[0].valueString) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected a valueString for the exportUrl, but none was found`
          }
        }
      ]
    });
  }
};

module.exports = { retrieveExportUrl };
