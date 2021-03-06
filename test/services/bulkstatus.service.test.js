const supertest = require('supertest');
const { bulkStatusSetup, cleanUpTest } = require('../populateTestData');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');

let server;
describe('bulkstatus.service', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    await bulkStatusSetup();
  });
  describe('checkBulkStatus logic', () => {
    test('check 202 returned for pending request', async () => {
      await supertest(server.app)
        .get('/4_0_1/bulkstatus/PENDING_REQUEST')
        .expect(202)
        .then(response => {
          expect(response.headers['retry-after']).toEqual('120');
        });
    });
    test('check 200 returned for completed request', async () => {
      const response = await supertest(server.app).get('/4_0_1/bulkstatus/COMPLETED_REQUEST').expect(200);
      expect(response.headers.expires).toBeDefined();
      expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(response.body).toBeDefined();
      expect(response.body.outcome[0].type).toEqual('OperationOutcome');
      await supertest(server.app)
        .get(response.body.outcome[0].url.replace(`http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}`, '')) //TODO: may need to break apart base_url to get slug
        .expect(200);
    });
    test('check single OperationOutcome response for completed request', async () => {
      const response = await supertest(server.app).get('/4_0_1/bulkstatus/COMPLETED_REQUEST').expect(200);
      const operationResponse = await supertest(server.app)
        .get(response.body.outcome[0].url.replace(`http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}`, ''))
        .expect(200);
      const count = (operationResponse.text.match(/OperationOutcome/g) || []).length;
      expect(count).toEqual(1);
    });
    test('check 200 returned with error OperationOutcome ndjson file when it exists', async () => {
      const response = await supertest(server.app)
        .get('/4_0_1/bulkstatus/COMPLETED_REQUEST_WITH_RESOURCE_ERRORS')
        .expect(200);
      expect(response.headers.expires).toBeDefined();
      expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(response.body).toBeDefined();
      expect(response.body.outcome.length).toEqual(2);
      expect(response.body.outcome[1].type).toEqual('OperationOutcome');
      await supertest(server.app)
        .get(response.body.outcome[1].url.replace(`http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}`, '')) //TODO: may need to break apart base_url to get slug
        .expect(200);
    });
    test('check 500 and error returned for failed request with known error', async () => {
      await supertest(server.app)
        .get('/4_0_1/bulkstatus/KNOWN_ERROR_REQUEST')
        .expect(500)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('ErrorCode');
          expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
          expect(response.body.issue[0].details.text).toEqual('Known Error Occurred!');
        });
    });
    test('check 500 and generic error returned for request with unknown error', async () => {
      await supertest(server.app)
        .get('/4_0_1/bulkstatus/UNKNOWN_ERROR_REQUEST')
        .expect(500)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('UnknownError');
          expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
          expect(response.body.issue[0].details.text).toEqual(
            'An unknown error occurred during bulk import with id: UNKNOWN_ERROR_REQUEST'
          );
        });
    });
    test('check 404 error returned for request with unknown ID', async () => {
      await supertest(server.app)
        .get('/4_0_1/bulkstatus/INVALID_ID')
        .expect(404)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('NotFound');
          expect(response.body.issue[0].details.text).toEqual('Could not find bulk import request with id: INVALID_ID');
        });
    });
    test('check operationOutcome includes the number of resources when available', async () => {
      await supertest(server.app).get('/4_0_1/bulkstatus/COMPLETED_REQUEST_WITH_RESOURCE_COUNT').expect(200);
      const response = await supertest(server.app).get(
        '/4_0_1/file/COMPLETED_REQUEST_WITH_RESOURCE_COUNT/OperationOutcome.ndjson'
      );
      const data = JSON.parse(response.text);
      expect(data.issue[0].details.text).toEqual(
        'Bulk import successfully completed, successfully imported 200 resources'
      );
    });
  });

  describe('Dynamic X-Progress logic', () => {
    test('check X-Progress header calculates percent complete when only file counts are available', async () => {
      await supertest(server.app)
        .get('/4_0_1/bulkstatus/PENDING_REQUEST_WITH_FILE_COUNT')
        .expect(202)
        .then(response => {
          // request contains total file count: 100 and exported file count: 10
          expect(response.headers['x-progress']).toEqual('90.00% Done');
        });
    });

    test('check X-Progress header calculates percent complete using resource count when available', async () => {
      await supertest(server.app)
        .get('/4_0_1/bulkstatus/PENDING_REQUEST_WITH_RESOURCE_COUNT')
        .expect(202)
        .then(response => {
          // request contains total resource count: 500 and exported resource count: 200
          expect(response.headers['x-progress']).toEqual('60.00% Done');
        });
    });
  });
  afterAll(cleanUpTest);
});
