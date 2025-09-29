//@ts-nocheck
const supertest = require('supertest');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const paramOneInput = require('../fixtures/fhir-resources/parameters/paramOneInput.json');
const paramTwoInputs = require('../fixtures/fhir-resources/parameters/paramTwoInputs.json');
const paramNoInput = require('../fixtures/fhir-resources/parameters/paramNoInput.json');
const paramNoInputValueUrl = require('../fixtures/fhir-resources/parameters/paramNoInputValueUrl.json');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const { client } = require('../../src/database/connection');
const { cleanUpTest } = require('../populateTestData');

let server;

describe('Testing $import', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    await client.connect();
  });

  it.only('Returns 202 on Valid Request with one input', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(paramOneInput)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
      });
  });

  it('Returns 202 on Valid Request with two inputs', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(paramTwoInputs)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(202)
      .then(response => {
        expect(response.headers['content-location']).toBeDefined();
      });
  });

  it('Returns 400 on missing exportUrl', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(paramNoInput)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].details.text).toEqual('No inputUrl parameters were found.');
      });
  });

  it('Returns 400 for FHIR Parameters object missing valueUrl for ndjson URL', async () => {
    await supertest(server.app)
      .post('/4_0_1/$import')
      .send(paramNoInputValueUrl)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].details.text).toEqual(
          'Expected a valueUrl for the inputUrl, but none were found.'
        );
      });
  });
  afterAll(cleanUpTest);
});
