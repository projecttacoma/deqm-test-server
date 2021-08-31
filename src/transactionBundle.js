class TransactionBundle {
  constructor() {
    this.entries = [];
  }

  addEntryFromResource(resource) {
    const newEntry = {
      resource: resource,
      request: {
        method: 'POST',
        url: resource.resourceType
      }
    };
    this.entries.push(newEntry);
  }

  toJSON() {
    return {
      resourceType: 'Bundle',
      type: 'transaction',
      entries: this.entries
    };
  }
}

module.exports = { TransactionBundle };
