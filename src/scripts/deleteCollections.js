const mongoUtil = require('../database/connection');

async function main() {
  // Use connect method to connect to the server
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');

  const collections = await mongoUtil.db.listCollections().toArray();
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
  .finally(() => mongoUtil.client.close());
