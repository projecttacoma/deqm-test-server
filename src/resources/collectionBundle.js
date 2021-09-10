/**
 * Defines the Collection class which will allow us to add resources to
 * the bundle in the correct format and convert the representation to JSON
 */

const { ServerError, resolveSchema } = require('@asymmetrik/node-fhir-server-core');

const createCollectionBundleClass = baseVersion => {
  const Bundle = resolveSchema(baseVersion, 'bundle');

  class CollectionBundle extends Bundle {
    constructor() {
      super();
      this.type = 'collection';
      this.entry = [];
    }

    addEntryFromResource(resource, requestType) {
      const request = { method: requestType };

      if (requestType === 'POST') {
        request.url = resource.resourceType;
      } else {
        throw new ServerError(null, {
          statusCode: 422,
          issue: [
            {
              severity: 'error',
              code: 'UnprocessableEntity',
              details: {
                text: `Invalid request type for transaction bundle entry for resource with id: ${resource.id}. 
              Request must be of type POST or PUT, received type: ${requestType}`
              }
            }
          ]
        });
      }
      const newEntry = {
        resource,
        request
      };
      this.entry = [...this.entry, newEntry];
    }
  }

  return new CollectionBundle();
};

module.exports = { createCollectionBundleClass };
