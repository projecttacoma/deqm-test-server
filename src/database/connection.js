const { MongoClient } = require('mongodb');
class Connection {
  static async connect(url) {
    if (this.connection != null) {
      return this.connection;
    }

    this.connection = new MongoClient(url);
    this.db = this.connection.db();

    return this.connection;
  }
}

module.exports = { Connection };
