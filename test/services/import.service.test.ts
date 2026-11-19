//@ts-nocheck
const supertest = require('supertest');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const paramOneInput = require('../fixtures/fhir-resources/parameters/paramOneInput.json');
const paramStatus = require('../fixtures/fhir-resources/parameters/paramStatus.json');
const paramNoInput = require('../fixtures/fhir-resources/parameters/paramNoInput.json');
const paramPastComplete = require('../fixtures/fhir-resources/parameters/paramPastComplete.json');
const paramReplace = require('../fixtures/fhir-resources/parameters/paramReplace.json');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const { client } = require('../../src/database/connection');
const { cleanUpDb, cleanUpTest } = require('../populateTestData');

jest.mock('../../src/queue/importQueue', () => ({
  importQueue: {
    createJob: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined)
  }
}));

const { importQueue } = require('../../src/queue/importQueue');

let server;
let job;

describe('Testing $bulk-submit', () => {
  beforeEach(async () => {
    job = {
      retries: jest.fn(),
      backoff: jest.fn(),
      save: jest.fn().mockResolvedValue({ id: 'test-import-job' })
    };
    importQueue.createJob.mockReturnValue(job);

    const config = buildConfig();
    server = initialize(config);
    await client.connect();
  });

  it('Returns 200 and queues manifest retrieval for a valid request', async () => {
    await supertest(server.app)
      .post('/4_0_1/$bulk-submit')
      .send(paramOneInput)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200);

    expect(importQueue.createJob).toHaveBeenCalledTimes(1);
    expect(importQueue.createJob).toHaveBeenCalledWith({
      submissionClientId: 'ExampleSubmitterValue-Submission1',
      manifestUrl: 'http://www.exampleFHIRServer.com/bulkstatus/5b19c9e9-06c3-4a53-a5c7-c73366173773',
      providerBaseUrl: 'http://www.exampleFHIRServer.com',
      replacesManifestUrl: undefined
    });
    expect(job.save).toHaveBeenCalledTimes(1);
  });

  it('Returns 200 and queues manifest replacement', async () => {
    await supertest(server.app)
      .post('/4_0_1/$bulk-submit')
      .send(paramReplace)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200);
    expect(importQueue.createJob).toHaveBeenCalledTimes(1);
    expect(importQueue.createJob).toHaveBeenCalledWith({
      submissionClientId: 'ExampleSubmitterValue-Submission1',
      manifestUrl: 'http://www.exampleFHIRServer.com/bulkstatus/updated',
      providerBaseUrl: 'http://www.exampleFHIRServer.com',
      replacesManifestUrl: 'http://www.exampleFHIRServer.com/bulkstatus/toReplace'
    });
    expect(job.save).toHaveBeenCalledTimes(1);
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

  it('Returns 400 for updating an already complete submission', async () => {
    await supertest(server.app)
      .post('/4_0_1/$bulk-submit')
      .send(paramStatus)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE));

    // send manifest with the same submitter/submission id on already complete status
    await supertest(server.app)
      .post('/4_0_1/$bulk-submit')
      .send(paramPastComplete)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(400)
      .then(response => {
        expect(response.body.resourceType).toEqual('OperationOutcome');
        expect(response.body.issue[0].details.text).toEqual(
          'Request applies a submission update to existing completed submission'
        );
      });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await cleanUpDb();
  });

  afterAll(async () => {
    await cleanUpTest();
  });
});
