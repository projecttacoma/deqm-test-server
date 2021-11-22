const JSONSchemaValidator = require('@asymmetrik/fhir-json-schema-validator');
const { ServerError } = require('@projecttacoma/node-fhir-server-core');
function validateResourceType(resource) {
  const validator = new JSONSchemaValidator();
  const errors = validator.validate(resource);
  if (errors) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: errors
          }
        }
      ]
    });
  }
}

module.exports = { validateResourceType };
