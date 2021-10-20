/**
 * Defines the TransactionBundle class which will allow us to add resources to
 * a txn bundle in the proper format and convert the representation to JSON
 */

const { ServerError, resolveSchema } = require('@projecttacoma/node-fhir-server-core');

const createTransactionBundleClass = baseVersion => {
  const Bundle = resolveSchema(baseVersion, 'bundle');

  class TransactionBundle extends Bundle {
    constructor() {
      super();
      this.type = 'transaction';
      this.entry = [];
    }

    addEntryFromResource(resource, requestType) {
      const request = { method: requestType };

      if (requestType === 'POST') {
        request.url = resource.resourceType;
      } else if (requestType === 'PUT') {
        request.url = `${resource.resourceType}/${resource.id}`;
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

  return new TransactionBundle();
};

module.exports = { createTransactionBundleClass };
