const supertest = require('supertest');
const { buildConfig } = require('../src/util/config');
const { initialize } = require('../src/server/server');
const validParam = require('./fixtures/parametersObjs/paramWithExport');
const paramNoExport = require('./fixtures/parametersObjs/paramNoExport.json');
const testParamTwoExports = require('./fixtures/parametersObjs/paramTwoExports.json');
const testParamNoValString = require('./fixtures/parametersObjs/paramNoValueString.json');
const { SINGLE_AGENT_PROVENANCE } = require('./fixtures/testProvenanceUtils');
const { client } = require('../src/util/mongo');
const { cleanUpDb } = require('./populateTestData');

const config = buildConfig();
const server = initialize(config);

describe('Testing $import with no specified measure bundle', () => {
  beforeEach(async () => {
    await client.connect();
  });
  test('Returns 202 on Valid Request', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(validParam)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
      });
  });
  test('Returns 400 on missing exportURL', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(paramNoExport)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(400);
  });
  test('FHIR Parameters object has two export URLs', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(testParamTwoExports)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(400);
  });

  test('FHIR Parameters object is missing valueString for export URL', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(testParamNoValString)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(400);
  });
  afterEach(async () => {
    await cleanUpDb();
  });
});
