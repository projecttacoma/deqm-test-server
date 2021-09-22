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
const data = {
  headers: 'application/json+fhir',
  title: 'test1',
  id: 'testMeasure'
};

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
        .post('/4_0_0/measure/testMeasure')
        .send(data)
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id).toBeTruthy();
          expect(response.body.title).toBe(data.title);
          expect(response.body.content).toBe(data.content);
        });
    });
  });
  describe('searchById', () => {
    //* result of sending a GET request to {BASE_URL}/4_0_0/Measure/{id}
    test('test searchById with correctHeaders and  the id should be in database', async () => {
      await supertest(server.app)
        //.get(BASE_URL)
        .get('/4_0_0/measure/testMeasure')
        .send(data)
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
  describe('update', () => {
    const updateData = {
      id: 'testMeasure'
    };
    //*a put request*/
    test('test update with correctHeaders and  the id is in database', () => {
      supertest(server.app)
        .put('/4_0_0/measure/testMeasure')
        .send(updateData)
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
        .delete('/4_0_0/measure/testMeasure')
        .send(data)
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
});
