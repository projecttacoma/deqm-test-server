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

const testSetup = async (pathToFiles, pathToPatients, pathToTestLibrary) => {
  await client.connect();
  await createTestResource(pathToFiles, 'Measure');
  await createTestResource(pathToPatients, 'Patient');
  await createTestResource(pathToTestLibrary, 'Library');
};
module.exports = { testSetup, cleanUpDb };
