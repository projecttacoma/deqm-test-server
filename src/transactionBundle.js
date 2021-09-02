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
