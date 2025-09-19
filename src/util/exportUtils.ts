//@ts-nocheck 
const { BadRequestError } = require('./errorUtils');
const logger = require('../server/logger');

/**
 * Uses request body parameter to get all of the ndjson URLs
 * @param {Object} parameters - request body parameter
 * @returns array of ndjson fileUrls
 */
const retrieveInputUrls = parameters => {
  logger.debug(`Retrieving all input URLs from parameters: ${JSON.stringify(parameters)}`);
  const inputParamArray = parameters.filter(param => param.name === 'input');
  checkInputUrlArray(inputParamArray);

  const inputUrlArray = inputParamArray.flatMap(param =>
    param.part
      .filter(p => p.name === 'url')
      .map(part => ({ type: part.valueUrl.split('.ndjson')[0].split('/').at(-1), url: part.valueUrl }))
  );
  return inputUrlArray;
};

/**
 * Checks whether the input URL array contains at least one input url and that
 * it contains a valueUrl
 * @param {Array} inputUrlArray array of input URLs provided in the request
 */
const checkInputUrlArray = inputParamArray => {
  if (inputParamArray.length === 0) {
    throw new BadRequestError('No inputUrl parameters were found.');
  }
  inputParamArray.forEach(inputUrl => {
    if (!inputUrl.part.find(p => p.name === 'url').valueUrl) {
      throw new BadRequestError('Expected a valueUrl for the inputUrl, but none were found.');
    }
  });
};

module.exports = { checkInputUrlArray, retrieveInputUrls };
