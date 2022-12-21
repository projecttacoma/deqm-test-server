require('../config/envConfig');
const mongoUtil = require('../database/connection');
const supportedResources = require('../server/supportedResources');
const url = `mongodb://${process.env.DB_HOST}:${process.env.DB_PORT}`;

/**
 * Adds an empty collection to the mongo db for each supported resource
 */
async function main() {
  // Use connect method to connect to the server
  await mongoUtil.Connection.connect(url);
  console.log('Connected successfully to server');

  const creations = supportedResources.map(async resourceType => {
    await (await mongoUtil.Connection.db.createCollection(resourceType)).createIndex({ id: 1 }, { unique: true });
    console.log('Created collection', resourceType);
  });

  await Promise.all(creations);
  return 'done.';
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(() => mongoUtil.Connection.connection.close());
