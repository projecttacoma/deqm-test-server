//{BASE_URL}/4_0_0/Measure/{id}
// for measure testing this the base url
require('../src/util/dbconfig');
const testMeasure = require('./fixtures/testMeasure.json');
const testLibrary = require('./fixtures/testLibrary.json');
const testPatient = require('./fixtures/testPatient.json');
const { testSetup, cleanUpDb } = require('./populateTestData');
const supertest = require('supertest');
const app = require('../src/index');
const route = require('../src/index');
const { buildConfig } = require('../src/util/config');
const { initialize } = require('../src/server/server');
const config = buildConfig();
const server = initialize(config);

const BASE_URL = 'localhost:3000/4_0_0/Measure/testMeasure';
const trailing_URL = ' /4_0_0/Measure/testMeasure';
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
        .post(BASE_URL)
        .send(data)
        .expect(200)
        .then(async response => {
          // Check the response
          expect(response.body._id).toBeTruthy();
          expect(response.body.title).toBe(data.title);
          expect(response.body.content).toBe(data.content);

          // Check the data in the database
          const post = Post.findOne({ _id: response.body._id });
          expect(post).toBeTruthy();
          expect(post.title).toBe(data.title);
          expect(post.content).toBe(data.content);
        });
      //console.log(app.server);
      //  const response = await request(route).post(BASE_URL).send(data).expect(200);
      //expect(response.body._id.toEqual(testLibrary.id));
    });
  });
  describe('searchById', () => {
    //* result of sending a GET request to {BASE_URL}/4_0_0/Measure/{id}
    test('test searchById with correctHeaders and  the id should be in database', async () => {
      await supertest(server.app)
        //.get(BASE_URL)
        .get(trailing_URL)
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

          // Check the data in the database
          const post = Post.findOne({ _id: response.body._id });
          expect(post).toBeTruthy();
          expect(post.title).toBe(data.title);
          expect(post.content).toBe(data.content);
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
        .put(BASE_URL)
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
        .delete(BASE_URL)
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
