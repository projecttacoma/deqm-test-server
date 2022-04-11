require('../../src/config/envConfig');
const supertest = require('supertest');
const { testSetup, cleanUpTest } = require('../populateTestData');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const testMeasure = require('../fixtures/fhir-resources/testMeasure.json');
const testLibrary = require('../fixtures/fhir-resources/testLibrary.json');
const testPatient = require('../fixtures/fhir-resources/testPatient.json');
const testPatient2 = require('../fixtures/fhir-resources/testPatient2.json');
const deletePatient = require('../fixtures/fhir-resources/deletePatient.json');

let server;
const updatePatient = { resourceType: 'Patient', id: 'testPatient', name: 'anUpdate' };

describe('patient.service', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    const dataToImport = [testMeasure, testLibrary, testPatient, testPatient2, deletePatient];
    await testSetup(dataToImport);
  });
  describe('CRUD operations', () => {
    test('test create with correct headers returns 200', async () => {
      await supertest(server.app)
        .post('/4_0_1/Patient')
        .send(testPatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(201)
        .then(response => {
          expect(response.headers.location).toBeDefined();
        });
    });

    test('test searchById with correctHeaders and the id is in database returns 200', async () => {
      await supertest(server.app)
        .get('/4_0_1/Patient/testPatient')
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(200)
        .then(response => {
          expect(response.body.id).toEqual(testPatient.id);
        });
    });

    test('test update with correctHeaders and the id is in database returns 200', async () => {
      await supertest(server.app)
        .put('/4_0_1/Patient/testPatient')
        .send(updatePatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(200)
        .then(response => {
          expect(response.headers.location).toBeDefined();
        });
    });

    test('removing the patient from the database when the patient is present returns 204', async () => {
      await supertest(server.app).delete('/4_0_1/Measure/deletePatient').expect(204);
    });

    test('removing the patient from the database when the patient is not present returns 204', async () => {
      await supertest(server.app).delete('/4_0_1/Measure/INVALID').expect(204);
    });
  });

  describe('testing custom measure operation', () => {
    test('$everything returns 500 for non-implemented params', async () => {
      await supertest(server.app)
        .get('/4_0_1/Patient/$everything?start=STARTDATE')
        .expect(501)
        .then(response => {
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
        .then(response => {
          expect(response.body).toBeDefined();
          expect(response.body.type).toEqual('searchset');
        });
    });

    test('$everything returns patient info for multiple patients', async () => {
      await supertest(server.app)
        .get('/4_0_1/Patient/$everything')
        .expect(200)
        .then(response => {
          expect(response.body).toBeDefined();
        });
    });
  });
  afterAll(cleanUpTest);
});
