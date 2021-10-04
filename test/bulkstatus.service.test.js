const { bulkStatusSetup, cleanUpDb } = require('./populateTestData');
const { buildConfig } = require('../src/util/config');
const { initialize } = require('../src/server/server');
const config = buildConfig();
const server = initialize(config);
const supertest = require('supertest');

describe('checkBulkStatus logic', () => {
  beforeAll(bulkStatusSetup);
  test('check 202 returned for pending request', async () => {
    await supertest(server.app)
      .get('/4_0_0/bulkstatus/PENDING_REQUEST')
      .expect(202)
      .then(response => {
        expect(response.body.id).toEqual('PENDING_REQUEST');
        expect(response.body.status).toEqual('Pending');
      });
  });
  test('check 200 returned for completed request', async () => {
    await supertest(server.app)
      .get('/4_0_0/bulkstatus/COMPLETED_REQUEST')
      .expect(200)
      .then(response => {
        expect(response.body.id).toEqual('COMPLETED_REQUEST');
        expect(response.body.status).toEqual('Completed');
      });
  });
  test('check 500 and error returned for failed request with known error', async () => {
    await supertest(server.app)
      .get('/4_0_0/bulkstatus/KNOWN_ERROR_REQUEST')
      .expect(500)
      .then(response => {
        expect(response.body.issue[0].code).toEqual('ErrorCode');
        expect(response.body.issue[0].details.text).toEqual('Known Error Occurred!');
      });
  });
  test('check 500 and generic error returned for request with unknown error', async () => {
    await supertest(server.app)
      .get('/4_0_0/bulkstatus/UNKNOWN_ERROR_REQUEST')
      .expect(500)
      .then(response => {
        expect(response.body.issue[0].code).toEqual('UnknownError');
        expect(response.body.issue[0].details.text).toEqual(
          'An unknown error occurred during bulk import with id: UNKNOWN_ERROR_REQUEST'
        );
      });
  });
  test('check 404 error returned for request with unknown ID', async () => {
    await supertest(server.app)
      .get('/4_0_0/bulkstatus/INVALID_ID')
      .expect(404)
      .then(response => {
        expect(response.body.issue[0].code).toEqual('NotFound');
        expect(response.body.issue[0].details.text).toEqual('Could not find bulk import request with id: INVALID_ID');
      });
  });
  afterAll(cleanUpDb);
});
