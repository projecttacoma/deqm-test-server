const { ServerError } = require('@projecttacoma/node-fhir-server-core');
const supportedResources = require('../server/supportedResources');

/**
 * Determines whether the passed in resourceType is one supported by our server.
 * Throws an error if not.
 * @param {string} resourceType A string representing a FHIR resource type
 */
function checkSupportedResource(resourceType) {
  if (!supportedResources.includes(resourceType)) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `resourceType: ${resourceType} is not a supported resourceType`
          }
        }
      ]
    });
  }
}

module.exports = { checkSupportedResource };
