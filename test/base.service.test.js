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
  url: 'http://localhost:3000',
  json: true,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: JSON.stringify(testPatient)
};
const putRequest = {
  encoding: 'utf8',
  url: 'http://localhost:3000',
  json: true,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: JSON.stringify(testPatient)
};
const getRequest = {
  encoding: 'utf8',
  url: 'http://localhost:3000',
  json: true,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: JSON.stringify(testPatient)
};

const deleteRequest = {
  encoding: 'utf8',
  url: 'http://localhost:3000',
  json: true,
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: JSON.stringify(testPatient)
};

describe('base.service', () => {
  beforeAll(async () => {
    await testSetup(testMeasure, testPatient, testLibrary);
  });
  afterAll(async () => {
    await cleanUpDb();
  });
  describe('create', () => {
    test('test create with correct headers', async () => {
      await supertest(server.app)
        .post('/4_0_0/Patient')
        .send(postRequest)
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id).not.toBeNull(); //!= null);
        });
    });
  });
  describe('searchById', () => {
    //* result of sending a GET request to {BASE_URL}/4_0_0/Measure/{id}
    test('test searchById with correctHeaders and  the id should be in database', async () => {
      await supertest(server.app)
        .get('/4_0_0/Patient/testPatient')
        .send(getRequest)
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.statusCode).not.toBe('ResourceNotFound');
        });
    });
  });
  describe('update', () => {
    //*a put request*/
    test('test update with correctHeaders and  the id is in database', () => {
      supertest(server.app)
        .put('/4_0_0/Patient/testPatient')
        .send(putRequest)
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id).toBeTruthy();
        });
    });
  });
  describe('remove', () => {
    test('removing the measure from the database when the measure is indeed present', () => {
      supertest(server.app)
        .delete('/4_0_0/Patient/testPatient')
        .send(deleteRequest)
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id).toBeTruthy();
        });
    });
  });
});
