require('../src/util/dbconfig');
const testMeasure = require('./fixtures/testMeasure.json');
const testLibrary = require('./fixtures/testLibrary.json');
const testPatient = require('./fixtures/testPatient.json');
const { testSetup, cleanUpDb } = require('./populateTestData');
const supertest = require('supertest');
const { buildConfig } = require('../src/util/config');
const { initialize } = require('../src/server/server');
const config = buildConfig();
const server = initialize(config);

const postRequest = {
  encoding: 'utf8',
  url: 'http://localhost:3000/4_0_0/Measure',
  json: true,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: { id: '1', name: 'testtestMeasure' }
};
const putRequest = {
  encoding: 'utf8',
  url: 'http://localhost:3000/4_0_0/Measure',
  json: true,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: { id: '11', name: 'testMeasure' }
};
const getRequest = {
  encoding: 'utf8',
  url: 'http://localhost:3000/4_0_0/Measure',
  json: true,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json+fhir',
    'Content-Type': 'application/fhir+json'
  },
 
  body: { id: '1', name: 'testMeasure' }
};

const deleteRequest = {
  url: 'http://localhost:3000/4_0_0/Measure',
  json: true,
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: JSON.stringify(testMeasure)
};
describe('measure.service', () => {
  beforeAll(async () => {
    await testSetup(testMeasure, testPatient, testLibrary);
  });

  describe('create', () => {
    test('test create with correct headers', async () => {
      await supertest(server.app)
        .post('/4_0_0/Measure')
        .send(postRequest)
        .set('Accept', 'application/json+fhir')
        .expect(200)
        .then(response => {
          // Check the response
          expect(response.body._id).not.toBeNull();
          expect(response.body.id != testMeasure.id); //this should be hte new uuid not the idea
        })
        .catch(error => {
          console.log('we have error', error);
        });
    });
  });

  describe('searchById', () => {
    //* result of sending a GET request to {BASE_URL}/4_0_0/Measure/{id}
    test('test searchById with correctHeaders and  the id should be in database', async () => {
      await supertest(server.app)
        .get('/4_0_0/Measure/testMeasure')
        .send(getRequest)
        .set('Accept', 'application/json+fhir')
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id).not.toBeNull();
          expect(response.statusCode).not.toBe('ResourceNotFound');
        });
    });
  });
  describe('update', () => {
    //*a put request*/
    test('test update with correctHeaders and  the id is in database', async () => {
      await supertest(server.app)
        .put('/4_0_0/Measure/testMeasure')
        .send(putRequest)
        .set('Accept', 'application/json+fhir')
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id).toBeTruthy();
          console.log(response.error.message);
        });
    });
  });
  describe('remove', () => {
    test('removing the measure from the database when the measure is indeed present', async () => {
      await supertest(server.app)
        .delete('/4_0_0/Measure/testMeasure')
        .send(deleteRequest)
        .expect(204)
        .then(async response => {
          // Check the response
          expect(response.body._id).toBeTruthy();
        });
    });
  });

  afterAll(async () => {
    await cleanUpDb();
  });
});
