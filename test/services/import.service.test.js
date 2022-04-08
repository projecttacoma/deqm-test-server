const supertest = require('supertest');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const validParam = require('../fixtures/fhir-resources/parameters/paramWithExport.json');
const paramNoExport = require('../fixtures/fhir-resources/parameters/paramNoExport.json');
const testParamTwoExports = require('../fixtures/fhir-resources/parameters/paramTwoExports.json');
const testParamNoValString = require('../fixtures/fhir-resources/parameters/paramNoValueUrl.json');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const { client } = require('../../src/database/connection');
const { cleanUpTest } = require('../populateTestData');

let server;

describe('Testing $import with no specified measure bundle', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
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
  test('Returns 400 on missing exportUrl', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(paramNoExport)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].details.text).toEqual('No exportUrl parameter was found.');
      });
  });
  test('FHIR Parameters object has two export URLs', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(testParamTwoExports)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].details.text).toEqual('Expected exactly one export URL. Received: 2');
      });
  });

  test('FHIR Parameters object is missing valueUrl for export URL', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(testParamNoValString)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].details.text).toEqual(
          'Expected a valueUrl for the exportUrl, but none was found'
        );
      });
  });
  afterAll(cleanUpTest);
});
