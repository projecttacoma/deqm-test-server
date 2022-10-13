/**
 * Defines the TransactionBundle class which will allow us to add resources to
 * a txn bundle in the proper format and convert the representation to JSON
 */

const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { UnprocessableEntityError } = require('../util/errorUtils');

/**
 * Create base transaction bundle class and instantiate a new transaction bundle
 * @param {string} baseVersion string representing version of FHIR to use
 * @return {Object} newly created transaction bundle
 */
const createTransactionBundleClass = baseVersion => {
  const Bundle = resolveSchema(baseVersion, 'bundle');

  class TransactionBundle extends Bundle {
    constructor() {
      super();
      this.type = 'transaction';
      this.entry = [];
    }
    /**
     * Adds a resource as an entry (including the request) to the bundle entry list
     * @param {Object} resource the fhir resource that should be added
     * @param {string} requestType the http request type that should be used for the transaction entry
     */
    addEntryFromResource(resource, requestType) {
      const request = { method: requestType };

      if (requestType === 'POST') {
        request.url = resource.resourceType;
      } else if (requestType === 'PUT') {
        request.url = `${resource.resourceType}/${resource.id}`;
      } else {
        throw new UnprocessableEntityError(`Invalid request type for transaction bundle entry for resource with id: ${resource.id}. 
        Request must be of type POST or PUT, received type: ${requestType}`);
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
