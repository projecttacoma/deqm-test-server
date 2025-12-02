//@ts-nocheck
const supertest = require('supertest');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const paramOneInput = require('../fixtures/fhir-resources/parameters/paramOneInput.json');
const paramStatus = require('../fixtures/fhir-resources/parameters/paramStatus.json');
const paramNoInput = require('../fixtures/fhir-resources/parameters/paramNoInput.json');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const { client } = require('../../src/database/connection');
const { cleanUpTest } = require('../populateTestData');

import axios from 'axios';
jest.mock('axios');

let server;

describe('Testing $bulk-submit', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    await client.connect();
  });

  it('Returns 200 on Valid Request with one input', async () => {
    const mockManifest = {
      transactionTime: '2025-10-29T13:03:52.312Z',
      requiresAccessToken: false,
      request: 'http://www.exampleFHIRServer.com/fhir/$export',
      output: [
        {
          type: 'Patient',
          url: 'http://www.exampleFHIRServer.com/output/patient_file_1.ndjson'
        },
        {
          type: 'Observation',
          url: 'http://www.exampleFHIRServer.com/output/observation_file_1.ndjson'
        }
      ]
    };
    axios.get.mockResolvedValue({ data: mockManifest });

    await supertest(server.app)
      .post('/4_0_1/$bulk-submit')
      .send(paramOneInput)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200)
      .then(() => {
        expect(axios.get).toHaveBeenCalledWith(
          'http://www.exampleFHIRServer.com/bulkstatus/5b19c9e9-06c3-4a53-a5c7-c73366173773'
        );
      });
  });

  it('Returns 200 on submission status update', async () => {
    await supertest(server.app)
      .post('/4_0_1/$bulk-submit')
      .send(paramStatus)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200);
  });

  it('Returns 400 on missing manifestUrl', async () => {
    await supertest(server.app)
      .post('/4_0_1/$bulk-submit')
      .send(paramNoInput)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].details.text).toEqual(
          'Request must include a manifestUrl parameter or appropriate submission status.'
        );
      });
  });

  afterAll(cleanUpTest);
});
