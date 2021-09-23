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
  body: JSON.stringify(testMeasure)
};
const putRequest = {
  encoding: 'utf8',
  url: 'http://localhost:3000',
  json: true,
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: JSON.stringify(testMeasure)
};
const getRequest = {
  encoding: 'utf8',
  url: 'http://localhost:3000',
  json: true,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: JSON.stringify(testMeasure)
}

const deleteRequest = {
  encoding: 'utf8',
  url: 'http://localhost:3000',
  json: true,
  method: 'DELETE',
  headers: {
    'Content-Type': 'application/json+fhir'
  },
  body: JSON.stringify(testMeasure)
}
describe('measure.service', () => {
  beforeAll(async () => {
    await testSetup(testMeasure, testPatient, testLibrary);
  });
  afterAll(async () => {
    await cleanUpDb();
  });
  test('test', async () => {
    await supertest(server.app).get('/4_0_0/metadata').expect(200);
  });
  describe('create', () => {
    test('test create with correct headers', async () => {
      await supertest(server.app)
        .post('/4_0_0/Measure')
        .send(postRequest)
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id != null);
          // expect(response.body.title).toBe(data.title);
          // expect(response.body.content).toBe(data.content);
        });
    });
  });
  describe('searchById', () => {
    //* result of sending a GET request to {BASE_URL}/4_0_0/Measure/{id}
    test('test searchById with correctHeaders and  the id should be in database', async () => {
      await supertest(server.app)
        .get('/4_0_0/Measure/testMeasure')
        .send(getRequest)
        .expect(200)
        .then(async response => {
          // Check the response

          expect(response.body.title).toBe(getRequest.title);
          expect(response.body.content).toBe(getRequest.content);
        });
    });
  });
  describe('update', () => {
    //*a put request*/
    test('test update with correctHeaders and  the id is in database', () => {
      supertest(server.app)
        .put('/4_0_0/Measure/testMeasure')
        .send(putRequest)
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id).toBeTruthy();
          expect(response.body.title).toBe(data.title);
          expect(response.body.content).toBe(data.content);

          // Check the response
          expect(response.body._id).toBeTruthy();
          expect(response.body.title).toBe(data.title);
          expect(response.body.content).toBe(data.content);
        });
    });
  });
  describe('remove', () => {
    test('removing the measure from the database when the measure is indeed present', () => {
      supertest(server.app)
        .delete('/4_0_0/Measure/testMeasure')
        .send(deleteRequest)
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id).toBeTruthy();
          expect(response.body.title).toBe(data.title);
          expect(response.body.content).toBe(data.content);
        });
    });
  });
});
