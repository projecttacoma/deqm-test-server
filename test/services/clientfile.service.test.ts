//@ts-nocheck
const supertest = require('supertest');
const { clientFileSetup, cleanUpTest } = require('../populateTestData');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');

let server;

describe('check client file', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    await clientFileSetup();
  });
  test('check 200 returned for successful file request', async () => {
    await supertest(server.app)
      .get('/4_0_1/file/testid/OperationOutcome.ndjson')
      .expect(200)
      .then(response => {
        expect(response.text.includes('testid')).toBeTruthy();
      });
  });
  test('check 404 returned for file not found', async () => {
    await supertest(server.app)
      .get('/4_0_1/file/testid/invalid.ndjson')
      .expect(404)
      .then(response => {
        expect(response.body.issue[0].code).toEqual('NotFound');
        expect(response.body.issue[0].details.text).toEqual('The following file was not found: testid/invalid.ndjson');
      });
  });
  afterAll(cleanUpTest);
});
