const { ServerError, loggers } = require('@projecttacoma/node-fhir-server-core');

const logger = loggers.get('default');
/**
 * Uses request body parameter to search for the export server URL. Validates that
 * only one URL is present.
 * @param {Object} parameters - request body parameter
 * @returns export server URL string
 */
const retrieveExportUrl = parameters => {
  logger.debug(`Retrieving export URL from parameters: ${JSON.stringify(parameters)}`);
  const exportUrlArray = parameters.filter(param => param.name === 'exportUrl');
  checkExportUrlArray(exportUrlArray);
  let exportUrl = exportUrlArray[0].valueUrl;

  // Retrieve comma-delimited list of type filters from parameters
  const typesString = parameters
    .filter(param => param.name === '_type')
    .map(function (type) {
      logger.debug(`Adding type ${type} to exportUrl type parameter`);
      return type.valueString;
    })
    .toString();

  if (typesString) {
    exportUrl = `${exportUrl}?_type=${typesString}`;
  }

  return exportUrl;
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
  // if one export URL exists, check that valueUrl exists
  if (!exportUrlArray[0].valueUrl) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected a valueUrl for the exportUrl, but none was found`
          }
        }
      ]
    });
  }
};

module.exports = { retrieveExportUrl };
