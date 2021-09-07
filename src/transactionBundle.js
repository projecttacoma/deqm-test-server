/**
 * Defines the TransactionBundle class which will allow us to add resources to
 * a txn bundle in the proper format and convert the representation to JSON
 */
class TransactionBundle {
  constructor() {
    this.entry = [];
  }

  addEntryFromResource(resource) {
    const newEntry = {
      resource: resource,
      request: {
        method: 'POST',
        url: resource.resourceType
      }
    };
    this.entry.push(newEntry);
  }

  toJSON() {
    return {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: this.entry
    };
  }
}

module.exports = { TransactionBundle };