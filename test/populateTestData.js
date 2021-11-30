const { db, client } = require('../src/database/connection');
const testStatuses = require('./fixtures/testBulkStatus.json');
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

const testSetup = async (testMeasure, testPatient, testLibrary) => {
  await client.connect();
  await createTestResource(testMeasure, 'Measure');
  await createTestResource(testPatient, 'Patient');
  await createTestResource(testLibrary, 'Library');
};

const bulkStatusSetup = async () => {
  await client.connect();
  const promises = testStatuses.map(async status => {
    await createTestResource(status, 'bulkImportStatuses');
  });
  await Promise.all(promises);
};
module.exports = { testSetup, cleanUpDb, bulkStatusSetup, createTestResource };
