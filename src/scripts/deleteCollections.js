const mongoUtil = require('../util/mongo');

async function main() {
  // Use connect method to connect to the server
  await mongoUtil.client.connect();
  console.log('Connected successfully to server');

  const collections = await mongoUtil.db.listCollections().toArray();
  const deletions = collections.map(async c => {
    console.log('Deleting contents from', c.name);
    return mongoUtil.db.collection(c.name).deleteMany({});
  });
  await Promise.all(deletions);
  return 'done.';
}

main()
  .then(console.log)
  .catch(console.error)
  .finally(() => mongoUtil.client.close());
