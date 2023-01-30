const { Connection } = require('../src/database/connection');
const testStatuses = require('./fixtures/testBulkStatus.json');
const testOperationOutcome = require('./fixtures/fhir-resources/testOperationOutcome.json');
const importQueue = require('../src/queue/importQueue');
const { execQueue } = require('../src/queue/execQueue');
const fs = require('fs');

async function createTestResource(data, resourceType) {
  const collection = Connection.db.collection(resourceType);
  await collection.insertOne({ ...data });
}

async function createEmptyCollection(resourceType) {
  await Connection.db.createCollection(resourceType);
}

//clean up db after test
async function cleanUpDb() {
  await Connection.db.dropDatabase();
  await Connection.connection?.close();
}

async function cleanUpTest() {
  if (!!Connection.connection.topology && Connection.connection.topology.isConnected()) await cleanUpDb();
  await importQueue.close();
  await execQueue.close();
}

async function clearTMP() {
  if (!!Connection.connection.topology && Connection.connection.topology.isConnected()) await cleanUpDb();
  await importQueue.close();
  await execQueue.close();
  if (fs.existsSync('./tmp/testid')) fs.rmSync('./tmp/testid', { recursive: true });
  if (fs.existsSync('./tmp/COMPLETED_REQUEST')) fs.rmSync('./tmp/COMPLETED_REQUEST', { recursive: true });
  if (fs.existsSync('./tmp/COMPLETED_REQUEST_WITH_RESOURCE_COUNT'))
    fs.rmSync('./tmp/COMPLETED_REQUEST_WITH_RESOURCE_COUNT', { recursive: true });
  if (fs.existsSync('./tmp/COMPLETED_REQUEST_WITH_RESOURCE_ERRORS'))
    fs.rmSync('./tmp/COMPLETED_REQUEST_WITH_RESOURCE_ERRORS', { recursive: true });
  if (fs.existsSync('./tmp/INVALID_ID')) fs.rmSync('./tmp/INVALID_ID', { recursive: true });
  if (fs.existsSync('./tmp/KNOWN_ERROR_REQUEST')) fs.rmSync('./tmp/KNOWN_ERROR_REQUEST', { recursive: true });
  if (fs.existsSync('./tmp/UNKNOWN_ERROR_REQUEST')) fs.rmSync('./tmp/UNKNOWN_ERROR_REQUEST', { recursive: true });
}

async function testSetup(testfixtureList) {
  await Connection.connect(global.__MONGO_URI__);

  for (const resource of testfixtureList) {
    await createTestResource(resource, resource.resourceType);
  }
}

async function resourceTestSetup(resourceType) {
  await Connection.connect(global.__MONGO_URI__);
  await createEmptyCollection(resourceType);
}

const bulkStatusSetup = async () => {
  await Connection.connect(global.__MONGO_URI__);
  for (const status of testStatuses) {
    await createTestResource(status, 'bulkImportStatuses');
  }
};

const clientFileSetup = async () => {
  fs.mkdirSync('./tmp/testid', { recursive: true });
  try {
    fs.writeFileSync('./tmp/testid/OperationOutcome.ndjson', JSON.stringify(testOperationOutcome));
  } catch (err) {
    console.error(err);
  }
};
module.exports = {
  testSetup,
  cleanUpTest,
  cleanUpDb,
  bulkStatusSetup,
  createTestResource,
  clientFileSetup,
  resourceTestSetup,
  clearTMP
};
