const supertest = require('supertest');
const { getPatientDataCollectionBundle } = require('../../src/util/patientUtils');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const { cleanUpTest, testSetup } = require('../populateTestData');
const testBundle = require('../fixtures/fhir-resources/testBundle.json');
const testNestedBundle = require('../fixtures/fhir-resources/testNestedBundle.json');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const DATA_REQ = [{ type: 'Procedure', codeFilter: [] }];

let server;

describe('Testing dynamic querying for patient references using compartment definition', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    await testSetup([]);
  });

  test('Check that patient reference can be found at one level', async () => {
    await supertest(server.app)
      .post('/4_0_1/')
      .send(testBundle)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200);
    const patientBundle = await getPatientDataCollectionBundle('test-patient', DATA_REQ);
    const procedure = patientBundle.entry.filter(e => e.resource.resourceType === 'Procedure')[0];
    const reference = procedure.resource.subject;
    expect(reference).toEqual({ reference: 'Patient/test-patient' });
  });

  test('Check that patient reference can be found at one level with Patient/{PatientId} style reference', async () => {
    await supertest(server.app)
      .post('/4_0_1/')
      .send(testBundle)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200);
    const patientBundle = await getPatientDataCollectionBundle('Patient/test-patient', DATA_REQ);
    const procedure = patientBundle.entry.filter(e => e.resource.resourceType === 'Procedure')[0];
    const reference = procedure.resource.subject;
    expect(reference).toEqual({ reference: 'Patient/test-patient' });
  });

  test('Check that patient reference can be found when nested', async () => {
    await supertest(server.app)
      .post('/4_0_1/')
      .send(testNestedBundle)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200);
    const patientBundle = await getPatientDataCollectionBundle('test-patient', DATA_REQ);
    const procedure = patientBundle.entry.filter(e => e.resource.resourceType === 'Procedure')[0];
    const reference = procedure.resource.performer.actor;
    expect(reference).toEqual({ reference: 'Patient/test-patient' });
  });

  test('Check that patient reference can be found when nested with Patient/{PatientId} style reference ', async () => {
    await supertest(server.app)
      .post('/4_0_1/')
      .send(testNestedBundle)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200);
    const patientBundle = await getPatientDataCollectionBundle('test-patient', DATA_REQ);
    const procedure = patientBundle.entry.filter(e => e.resource.resourceType === 'Procedure')[0];
    const reference = procedure.resource.performer.actor;
    expect(reference).toEqual({ reference: 'Patient/test-patient' });
  });
  afterAll(cleanUpTest);
});
