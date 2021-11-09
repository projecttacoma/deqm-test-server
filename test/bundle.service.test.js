const { uploadTransactionBundle } = require('../src/services/bundle.service');
const testBundle = require('./fixtures/testBundle.json');
const { client } = require('../src/util/mongo');
const { cleanUpDb } = require('./populateTestData');
const supertest = require('supertest');
const { buildConfig } = require('../src/util/config');
const { initialize } = require('../src/server/server');
const config = buildConfig();
const server = initialize(config);

const NON_BUNDLE_REQ = {
  body: { resourceType: 'invalidType', type: 'transaction' },
  params: { base_version: '4_0_1' }
};
const NON_TXN_REQ = { body: { resourceType: 'Bundle', type: 'invalidType' }, params: { base_version: '4_0_1' } };

describe('uploadTransactionBundle Server errors', () => {
  test('error thrown if resource type is not Bundle', async () => {
    try {
      await uploadTransactionBundle(NON_BUNDLE_REQ, {});
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `Expected 'resourceType: Bundle', but received 'resourceType: invalidType'.`
      );
    }
  });

  test('error thrown if type is not transaction', async () => {
    try {
      await uploadTransactionBundle(NON_TXN_REQ, {});
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(`Expected 'type: transaction'. Received 'type: invalidType'.`);
    }
  });
});
describe('Test transaction bundle upload', () => {
  beforeAll(async () => {
    await client.connect();
  });

  test('Transaction bundle upload populates provenance target', async () => {
    await supertest(server.app)
      .post('/4_0_1/')
      .send(testBundle)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', '{"resourceType": "Provenance"}')
      .expect(200)
      .then(async response => {
        // Check the response
        expect(JSON.parse(response.headers['x-provenance']).target).toBeDefined();
      });
  });

  afterAll(async () => {
    await cleanUpDb();
  });
});
