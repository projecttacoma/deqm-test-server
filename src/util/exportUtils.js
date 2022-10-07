const { BadRequestError } = require('./errorUtils');
const logger = require('../server/logger');

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

  const typeFilterString = parameters
    .filter(param => param.name === '_typeFilter')
    .map(function (typeFilter) {
      logger.debug(`Adding typeFilter ${typeFilter} to exportUrl typeFilter parameter`);
      return typeFilter.valueString;
    })
    .toString();

  if (typesString) {
    if (exportUrl.includes(`_type=`)) {
      console.warn('_type parameter already supplied in exportUrl. Omitting entries from parameter array');
    } else {
      // add types from parameters to exportUrl
      exportUrl += `${exportUrl.includes('_typeFilter=') ? '&' : '?'}_type=${typesString}`;
    }
  }

  if (typeFilterString) {
    if (exportUrl.includes(`_typeFilter=`)) {
      console.warn('_typeFilter parameter already supplied in exportUrl. Omitting entries from parameter array');
    } else {
      // add type filters from parameters to exportUrl
      exportUrl += `${exportUrl.includes('_type=') ? '&' : '?'}_typeFilter=${typeFilterString}`;
    }
  }
  return exportUrl;
};

/**
 * Checks whether the export URL array contains exactly one exportUrl
 * @param {Array} exportUrlArray array of export URLs provided in request
 */
const checkExportUrlArray = exportUrlArray => {
  if (exportUrlArray.length === 0) {
    throw new BadRequestError(`No exportUrl parameter was found.`);
  }
  if (exportUrlArray.length !== 1) {
    throw new BadRequestError(`Expected exactly one export URL. Received: ${exportUrlArray.length}`);
  }
  // if one export URL exists, check that valueUrl exists
  if (!exportUrlArray[0].valueUrl) {
    throw new BadRequestError(`Expected a valueUrl for the exportUrl, but none was found`);
  }
};

/**
 * Uses request body parameter to search for the export server type if there is one.
 * If there is none, defaults to dynamic.
 */
const retrieveExportType = parameters => {
  logger.debug(`Retrieving export type from parameters: ${JSON.stringify(parameters)}`);
  const exportType = parameters.find(param => param.name === 'exportType');

  if (!exportType) {
    return 'dynamic';
  } else {
    return exportType.valueCode;
  }
};

module.exports = { retrieveExportUrl, checkExportUrlArray, retrieveExportType };
