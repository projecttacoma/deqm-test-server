const { BadRequestError } = require('./errorUtils');
const supportedResources = require('../server/supportedResources');

/**
 * Determines whether the passed in resourceType is one supported by our server.
 * Throws an error if not.
 * @param {string} resourceType A string representing a FHIR resource type
 */
function checkSupportedResource(resourceType) {
  if (!supportedResources.includes(resourceType)) {
    throw new BadRequestError(`resourceType: ${resourceType} is not a supported resourceType`);
  }
}

/**
 * Checks if the content-type header is incorrect and throws an error with guidance if so
 * @param {Object} requestHeaders the headers from the request body
 */
const checkContentTypeHeader = requestHeaders => {
  if (
    requestHeaders['content-type'] !== 'application/json+fhir' &&
    requestHeaders['content-type'] !== 'application/fhir+json'
  ) {
    throw new BadRequestError(
      'Ensure Content-Type is set to application/json+fhir or to application/fhir+json in headers'
    );
  }
};

/**
 * Gets the current time as a FHIR instant to populate meta.lastUpdated for resource creation and updating
 * @returns {string} current time in GMT as a FHIR instant
 */
const getCurrentInstant = () => {
  const event = new Date();
  return event.toISOString();
};

module.exports = { checkSupportedResource, checkContentTypeHeader, getCurrentInstant };
