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
const updateMeasure = { id: 'testMeasure', name: 'anUpdate' };
describe('measure.service', () => {
  beforeAll(async () => {
    await testSetup(testMeasure, testPatient, testLibrary);
  });

  describe('create', () => {
    test('test create with correct headers', async () => {
      await supertest(server.app)
        .post('/4_0_0/Measure')
        .send(testMeasure)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(201)
        .then(response => {
          // Check the response
          expect(response.body._id).not.toBeNull();
          expect(response.headers.location).not.toBeNull();
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
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
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
        .send(updateMeasure)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.headers.location).toBeTruthy();
          expect(response.body.location).not.toBeNull();
          console.log(response.error.message);
        });
    });
  });
  describe('remove', () => {
    test('removing the measure from the database when the measure is indeed present', async () => {
      await supertest(server.app)
        .delete('/4_0_0/Measure/testMeasure')
        .send(testMeasure)
        .expect(204)
        .then(async response => {
          // Check the response
          expect(response.statusCode).toBe(204);
        });
    });
  });

  afterAll(async () => {
    await cleanUpDb();
  });
});