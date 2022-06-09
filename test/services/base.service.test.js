require('../../src/config/envConfig');
const supertest = require('supertest');
const testMeasure = require('../fixtures/fhir-resources/testMeasure.json');
const testLibrary = require('../fixtures/fhir-resources/testLibrary.json');
const testPatient = require('../fixtures/fhir-resources/testPatient.json');
const testPatient2 = require('../fixtures/fhir-resources/testPatient2.json');
const { testSetup, cleanUpTest } = require('../populateTestData');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const { db } = require('../../src/database/connection');

const updatePatient = { resourceType: 'Patient', id: 'testPatient', name: 'anUpdate' };

const UPDATE_PATIENT_2 = { resourceType: 'Patient', id: 'testPatient2', name: 'anUpdate' };
let server;

describe('base.service', () => {
  beforeAll(() => {
    const config = buildConfig();
    server = initialize(config);
  });
  beforeEach(async () => {
    const dataToImport = [testMeasure, testLibrary, testPatient, testPatient2];
    await testSetup(dataToImport);
  });
  describe('searchById', () => {
    test('test searchById with correctHeaders and the id should be in database', async () => {
      await supertest(server.app)
        .get('/4_0_1/Patient/testPatient')
        .set('Accept', 'application/json+fhir')
        .expect(200)
        .then(response => {
          expect(response.body.id).toEqual(testPatient.id);
        });
    });

    test('test searchById when the id cannot be found in the database', async () => {
      await supertest(server.app)
        .get('/4_0_1/Patient/invalidID')
        .set('Accept', 'application/json+fhir')
        .expect(404)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('ResourceNotFound');
          expect(response.body.issue[0].details.text).toEqual(
            `No resource found in collection: Patient, with: id invalidID`
          );
        });
    });
  });

  describe('search', () => {
    test('test search with correct args and headers', async () => {
      await supertest(server.app)
        .get('/4_0_1/Patient')
        .set('Accept', 'application/json+fhir')
        .expect(200)
        .then(response => {
          expect(response.body.resourceType).toEqual('Bundle');
          expect(response.body.type).toEqual('searchset');
          expect(response.body.total).toEqual(1);
          expect(response.body.entry[0].resource.id).toEqual(testPatient.id);
          expect(response.body.entry[0].resource.resourceType).toEqual('Patient');
        });
    });

    test('test search with unsupported parameter', async () => {
      await supertest(server.app)
        .get('/4_0_1/Patient?publisher=abc')
        .set('Accept', 'application/json+fhir')
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(`Unknown parameter 'publisher'`);
        });
    });
  });

  describe('create', () => {
    test('test create with correct headers', async () => {
      await supertest(server.app)
        .post('/4_0_1/Patient')
        .send(testPatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(201)
        .then(response => {
          expect(response.headers.location).toBeDefined();
          expect(JSON.parse(response.headers['x-provenance']).target).toBeDefined();
        });
    });

    test('test for meta.lastUpdated inclusion', async () => {
      await supertest(server.app)
        .post('/4_0_1/Patient')
        .send(testPatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(201)
        .then(async response => {
          const id = response.headers.location.split('/')[2];
          const patientCollection = db.collection('Patient');
          const retrievedPatient = await patientCollection.findOne({ id: id });
          expect(retrievedPatient.meta.lastUpdated).toBeDefined();
        });
    });

    test('test create without provenance header', async () => {
      await supertest(server.app)
        .post('/4_0_1/Patient')
        .send(testPatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(201)
        .then(response => {
          expect(response.headers.location).toBeDefined();
        });
    });

    test('test create with missing Provenance resourceType', async () => {
      await supertest(server.app)
        .post('/4_0_1/Patient')
        .send(testPatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', '{}')
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(
            `Expected resourceType 'Provenance' for Provenance header. Received undefined.`
          );
        });
    });

    test('test create with populated provenance target', async () => {
      await supertest(server.app)
        .post('/4_0_1/Patient')
        .send(testPatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', '{ "resourceType": "Provenance", "target": [{"reference": "testRef"}]}')
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(
            `The 'target' attribute should not be populated in the provenance header`
          );
        });
    });
  });
  describe('update', () => {
    test('test update with populated provenance target throws error', async () => {
      await supertest(server.app)
        .put('/4_0_1/Patient/testPatient')
        .send(updatePatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', '{ "resourceType": "Provenance", "target": [{"reference": "testRef"}]}')
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(
            `The 'target' attribute should not be populated in the provenance header`
          );
        });
    });

    test('test for meta.lastUpdated inclusion', async () => {
      await supertest(server.app)
        .put('/4_0_1/Patient/testPatient2')
        .send(UPDATE_PATIENT_2)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(200)
        .then(async response => {
          const patientCollection = db.collection('Patient');
          const retrievedPatient = await patientCollection.findOne({ id: UPDATE_PATIENT_2.id });
          expect(retrievedPatient.meta.lastUpdated).toBeDefined();
          expect(new Date(retrievedPatient.meta.lastUpdated) > new Date(testPatient2.meta.lastUpdated));
        });
    });

    test('test update without provenance header returns 200 with location header', async () => {
      await supertest(server.app)
        .put('/4_0_1/Patient/testPatient')
        .send(updatePatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(200)
        .then(response => {
          expect(response.headers.location).toBeDefined();
        });
    });

    test('test update with missing Provenance resourceType throws 400 error', async () => {
      await supertest(server.app)
        .put('/4_0_1/Patient/testPatient')
        .send(updatePatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', '{}')
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(
            `Expected resourceType 'Provenance' for Provenance header. Received undefined.`
          );
        });
    });
    test('test update with correctHeaders and the id is in database returns 200 with correct headers', async () => {
      await supertest(server.app)
        .put('/4_0_1/Patient/testPatient')
        .send(updatePatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(200)
        .then(response => {
          expect(response.headers.location).toBeDefined();
          expect(JSON.parse(response.headers['x-provenance']).target).toEqual([{ reference: 'Patient/testPatient' }]);
        });
    });

    test('test update with invalid arg id throws 400 error', async () => {
      await supertest(server.app)
        .put('/4_0_1/Patient/invalidID')
        .send(updatePatient)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', '{ "resourceType": "Provenance"}')
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual('Argument id must match request body id for PUT request');
        });
    });
  });
  describe('remove', () => {
    test('removing the data from the database when the id is in the database returns 204', async () => {
      await supertest(server.app)
        .delete('/4_0_1/Patient/testPatient')
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(204);
    });
    test('removing the data from the database when the id is not in the database returns 204', async () => {
      await supertest(server.app)
        .delete('/4_0_1/Patient/INVALID')
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(204);
    });
  });
  afterEach(cleanUpTest);
});
