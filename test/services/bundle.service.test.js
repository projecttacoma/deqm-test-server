const supertest = require('supertest');
const { uploadTransactionBundle } = require('../../src/services/bundle.service');
const { client } = require('../../src/database/connection');
const { cleanUpTest } = require('../populateTestData');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const testBundle = require('../fixtures/fhir-resources/testBundle.json');
const testParamResource = require('../fixtures/fhir-resources/parameters/paramNoExportResource.json');

const config = buildConfig();
const server = initialize(config);

const NON_BUNDLE_REQ = {
  body: { resourceType: 'invalidType', type: 'transaction' },
  params: { base_version: '4_0_1' },
  headers: { 'content-type': 'application/json+fhir' }
};

const NON_TXN_REQ = {
  body: { resourceType: 'Bundle', type: 'invalidType' },
  params: { base_version: '4_0_1' },
  headers: { 'content-type': 'application/json+fhir' }
};
const INVALID_METHOD_REQ = {
  body: {
    resourceType: 'Bundle',
    type: 'transaction',
    entry: [
      {
        resource: {
          resourceType: 'Parameter',
          id: 'test-measure',
          library: ['Library/test-library']
        },
        request: {
          method: 'PUT',
          url: 'Measure/test-measure'
        }
      }
    ]
  },
};
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
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200)
      .then(async response => {
        // Check the response
        expect(JSON.parse(response.headers['x-provenance']).target).toBeDefined();
      });
  });

  test('error thrown if method  type is not PUT or POST', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(INVALID_METHOD_REQ)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(400)
      .then(async response => {
        expect(response.body.issue[0].code).toEqual('BadRequest');
        expect(response.body.issue[0].details).toEqual();
      });
  });
});
describe('Test handle submit data bundle', () => {
  beforeAll(async () => {
    await client.connect();
  });

  test('Submit data bundle with resources creates AuditEvent with resources', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testParamResource)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200)
      .then(async response => {
        // Check the response
        expect(JSON.parse(response.headers['x-provenance']).target).toBeDefined();
      });
    // Check for AuditEvent with resources
    await supertest(server.app)
      .get('/4_0_1/AuditEvent')
      .set('Accept', 'application/json+fhir')
      .expect(200)
      .then(async response => {
        expect(response.body.resourceType).toEqual('Bundle');
        expect(response.body.type).toEqual('searchset');
        expect(response.body.total).toEqual(1);
        expect(response.body.entry[0].resource.resourceType).toEqual('AuditEvent');
        const entities = response.body.entry[0].resource.entity;
        expect(entities.some(ent => ent.what.reference.startsWith('MeasureReport'))).toBe(true);
        expect(entities.some(ent => ent.what.reference.startsWith('Encounter'))).toBe(true);
      });
  });

  afterAll(cleanUpTest);
});
