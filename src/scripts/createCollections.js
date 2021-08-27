const mongoUtil = require('../util/mongo');
const supportedResources = require('../util/supportedResources');

async function main() {
  // Use connect method to connect to the server
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');

  const creations = supportedResources.map(async resourceType => {
    await (await mongoUtil.db.createCollection(resourceType)).createIndex({ id: 1 }, { unique: true });
    console.log('Created collection', resourceType);
  });

  await Promise.all(creations);
  return 'done.';
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(() => mongoUtil.client.close());
