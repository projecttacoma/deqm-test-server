const { db } = require('../src/util/mongo');
require('dotenv').config({ path: './.env.test' });

const createTestResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  await collection.insertOne(data);
  return { id: data.id };
};
//clean up db after test
function cleanUpDb() {}

function testSetup(pathToFiles, pathToPatients, pathToTestLibrary) {
  createTestResource(pathToFiles, 'Measure');
  createTestResource(pathToPatients, 'Patient');
  createTestResource(pathToTestLibrary, 'Library');
}
module.exports = { testSetup, cleanUpDb };
