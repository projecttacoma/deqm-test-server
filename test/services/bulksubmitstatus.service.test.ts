//@ts-nocheck
const supertest = require('supertest');
const { bulkStatusSetup, cleanUpTest } = require('../populateTestData');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const bulkSubmitStatusInput = require('../fixtures/fhir-resources/parameters/bulkSubmitStatusInput.json');
const bulkSubmitStatusInputMissingSubmitter = require('../fixtures/fhir-resources/parameters/bulkSubmitStatusInputMissingSubmitter.json');
const bulkSubmitStatusInputMissingSubmissionId = require('../fixtures/fhir-resources/parameters/bulkSubmitStatusInputMissingSubmissionId.json');

let server;
describe('bulksubmitstatus.service', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    await bulkStatusSetup();
  });

  describe('bulkSubmitStatus logic', () => {
    it('returns 202 status on valid request', async () => {
      await supertest(server.app)
        .post('/4_0_1/$bulk-submit-status')
        .send(bulkSubmitStatusInput)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(202)
        .then(response => {
          expect(response.headers['content-location']).toBeDefined();
        });
    });

    it('returns 400 status on missing submissionId', async () => {
      await supertest(server.app)
        .post('/4_0_1/$bulk-submit-status')
        .send(bulkSubmitStatusInputMissingSubmitter)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(400)
        .then(response => {
          expect(response.body.resourceType).toEqual('OperationOutcome');
          expect(response.body.issue[0].details.text).toEqual(
            '$bulk-submit-status endpoint requires a FHIR Parameters resource request body with a submitter Identifier parameter.'
          );
        });
    });

    it('returns 400 status on missing submitter', async () => {
      await supertest(server.app)
        .post('/4_0_1/$bulk-submit-status')
        .send(bulkSubmitStatusInputMissingSubmissionId)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(400)
        .then(response => {
          expect(response.body.resourceType).toEqual('OperationOutcome');
          expect(response.body.issue[0].details.text).toEqual(
            '$bulk-submit-status endpoint requires a FHIR Parameters resource request body with a submissionId string parameter.'
          );
        });
    });
  });
  afterAll(cleanUpTest);
});
