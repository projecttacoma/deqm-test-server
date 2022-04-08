const { db, client } = require('../src/database/connection');
const testStatuses = require('./fixtures/testBulkStatus.json');
const testOperationOutcome = require('./fixtures/fhir-resources/testOperationOutcome.json');
const queue = require('../src/queue/importQueue');
const fs = require('fs');

const createTestResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  await collection.insertOne(data);
  return { id: data.id };
};
//clean up db after test
async function cleanUpDb() {
  await db.dropDatabase();
  await client.close();
}

async function cleanUpTest() {
  if (!!client.topology && client.topology.isConnected()) await cleanUpDb();
  if (fs.existsSync('./tmp/testid')) fs.rmSync('./tmp/testid', { recursive: true });
  if (fs.existsSync('./tmp/COMPLETED_REQUEST')) fs.rmSync('./tmp/COMPLETED_REQUEST', { recursive: true });
  await queue.close();
}

/**DOD: testSetup() function takes an array of FHIR resources and creates an
 * entry in mongo for each of them. All calls to testSetup() are updated. */

const testSetup = async (testfixtureList) => {
  await client.connect();

  for (const x of testfixtureList) {
    await createTestResource(x, toString(x.resourceType));
  }
};
const bulkStatusSetup = async () => {
  await client.connect();
  const promises = testStatuses.map(async status => {
    await createTestResource(status, 'bulkImportStatuses');
  });
  await Promise.all(promises);
};

const clientFileSetup = async () => {
  fs.mkdirSync('./tmp/testid', { recursive: true });
  try {
    fs.writeFileSync('./tmp/testid/OperationOutcome.ndjson', JSON.stringify(testOperationOutcome));
  } catch (err) {
    console.error(err);
  }
};
module.exports = { testSetup, cleanUpTest, bulkStatusSetup, createTestResource, clientFileSetup };
