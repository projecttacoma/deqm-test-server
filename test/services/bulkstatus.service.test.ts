//@ts-nocheck
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
    it('returns 202 status for pending request', async () => {
      await supertest(server.app)
        .get('/4_0_1/bulkstatus/PENDING_REQUEST')
        .expect(202)
        .then(response => {
          expect(response.headers['retry-after']).toEqual('120');
        });
    });

    it('returns 200 status for completed request', async () => {
      const response = await supertest(server.app).get('/4_0_1/bulkstatus/COMPLETED_REQUEST').expect(200);
      expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(response.body).toBeDefined();
      expect(response.body.output[0].url).toBeDefined();
    });

    it('returns 200 status and populated errors.ndjson when $import failed', async () => {
      const response = await supertest(server.app).get('/4_0_1/bulkstatus/ERROR_REQUEST').expect(200);
      expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(response.body).toBeDefined();
      expect(response.body.error[0].url).toBeDefined();
    });

    it('returns 200 status for completed request but with one failed outcome', async () => {
      const response = await supertest(server.app)
        .get('/4_0_1/bulkstatus/COMPLETED_REQUEST_WITH_RESOURCE_ERRORS')
        .expect(200);
      expect(response.headers['content-type']).toEqual('application/json; charset=utf-8');
      expect(response.body).toBeDefined();
      expect(response.body.error[0].url).toBeDefined();
    });

    it('returns 404 status for request with unknown ID', async () => {
      await supertest(server.app)
        .get('/4_0_1/bulkstatus/INVALID_ID')
        .expect(404)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('NotFound');
          expect(response.body.issue[0].details.text).toEqual('Could not find bulk import request with id: INVALID_ID');
        });
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
