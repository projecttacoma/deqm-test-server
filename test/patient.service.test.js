require('../src/util/dbconfig');
const testMeasure = require('./fixtures/testMeasure.json');
const testLibrary = require('./fixtures/testLibrary.json');
const testPatient = require('./fixtures/testPatient.json');
const testPatient2 = require('./fixtures/testPatient2.json');
const { testSetup, cleanUpDb, createTestResource } = require('./populateTestData');
const supertest = require('supertest');
const { buildConfig } = require('../src/util/config');
const { initialize } = require('../src/server/server');
const { client } = require('../src/util/mongo');

const config = buildConfig();
const server = initialize(config);
const updatePatient = { id: 'testPatient', name: 'anUpdate' };
describe('measure.service CRUD operations', () => {
  beforeAll(async () => {
    await testSetup(testMeasure, testPatient, testLibrary);
  });

  test('test create with correct headers', async () => {
    await supertest(server.app)
      .post('/4_0_1/Patient')
      .send(testPatient)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', '{ "resourceType": "Provenance"}')
      .expect(201)
      .then(response => {
        expect(response.headers.location).toBeDefined();
      });
  });

  test('test searchById with correctHeaders and the id should be in database', async () => {
    await supertest(server.app)
      .get('/4_0_1/Patient/testPatient')
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(200)
      .then(async response => {
        expect(response.body.id).toEqual(testPatient.id);
      });
  });

  test('test update with correctHeaders and the id is in database', async () => {
    await supertest(server.app)
      .put('/4_0_1/Patient/testPatient')
      .send(updatePatient)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', '{ "resourceType": "Provenance"}')
      .expect(200)
      .then(async response => {
        // Check the response
        expect(response.headers.location).toBeDefined();
      });
  });

  test('removing the patient from the database when the patient is indeed present', async () => {
    await supertest(server.app).delete('/4_0_1/Measure/testPatient').expect(204);
  });

  afterAll(async () => {
    await cleanUpDb();
  });
});

describe('testing custom measure operation', () => {
  beforeAll(async () => {
    await client.connect();
    await createTestResource(testPatient2, 'Patient');
    await testSetup(testMeasure, testPatient, testLibrary);
  });

  test('$everything returns 500 for non-implemented params', async () => {
    await supertest(server.app)
      .get('/4_0_1/Patient/$everything?start=STARTDATE')
      .expect(501)
      .then(async response => {
        expect(response.body.issue[0].code).toEqual('NotImplemented');
        expect(response.body.issue[0].details.text).toEqual(
          '$everything functionality has not yet been implemented for requests with parameters: start'
        );
      });
  });

  test('$everything returns patient info for single patient', async () => {
    await supertest(server.app)
      .get('/4_0_1/Patient/testPatient/$everything')
      .expect(200)
      .then(async response => {
        expect(response.body).toBeDefined();
        expect(response.body.type).toEqual('searchset');
      });
  });

  test('$everything returns patient info for multiple patients', async () => {
    await supertest(server.app)
      .get('/4_0_1/Patient/$everything')
      .expect(200)
      .then(async response => {
        expect(response.body).toBeDefined();
        expect(response.body.length).toEqual(2);
      });
  });

  afterAll(async () => {
    await cleanUpDb();
  });
});