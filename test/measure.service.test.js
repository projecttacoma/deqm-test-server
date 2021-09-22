//{BASE_URL}/4_0_0/Measure/{id}
// for measure testing this the base url
const BASE_URL = 'localhost:3000/4_0_0/Measure/testMeasure';
const data = {
  headers: 'application/json+fhir',
  title: 'test1',
  id: 'testMeasure'
};

const { testSetup, cleanUpDb } = require('./populateTestData');
const supertest = require('supertest');
const app = require('../src/index');
//const DEQMTestServer = require('../src/server/server');
//const apptest = supertest(http.createServer(DEQMTestServer.callback()));
 describe('measure.service', () => {
  /**populateMeasures */
  beforeEach(() => {
    testSetup('testMeasure.json', 'testPatient.json', 'testLibrary.json');
  });
  /* afterEach(done => {
    cleanUpDb()
  });*/

  describe('create', () => {
    test('test create with correct headers', async () => {
      await supertest(app)
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
    });
  });
  describe('searchById', () => {
    //* result of sending a GET request to {BASE_URL}/4_0_0/Measure/{id}
    test('test searchById with correctHeaders and  the id should be in database', () => {
      supertest(app)
        .get(BASE_URL)
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
      supertest(app)
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
      supertest(app)
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
