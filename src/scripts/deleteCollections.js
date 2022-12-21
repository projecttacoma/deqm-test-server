require('../config/envConfig');
const mongoUtil = require('../database/connection');
const url = `mongodb://${process.env.DB_HOST}:${process.env.DB_PORT}`;

/**
 * Deletes all collections stored in mongo
 */
async function main() {
  // Use connect method to connect to the server
  await mongoUtil.Connection.connect(url);
  console.log('Connected successfully to server');

  const collections = await mongoUtil.Connection.db.listCollections().toArray();
  const deletions = collections.map(async c => {
    console.log('Deleting collection', c.name);
    return mongoUtil.db.dropCollection(c.name);
  });
  await Promise.all(deletions);
  return 'done.';
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(() => mongoUtil.Connection.connection.close());
