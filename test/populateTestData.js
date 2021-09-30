const { db, client } = require('../src/util/mongo');
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
module.exports = { testSetup, cleanUpDb };
