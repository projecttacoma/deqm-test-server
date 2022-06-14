require('../../src/config/envConfig');
const supertest = require('supertest');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const testMeasure = require('../fixtures/fhir-resources/testMeasure.json');
const testLibrary = require('../fixtures/fhir-resources/testLibrary.json');
const testPatient = require('../fixtures/fhir-resources/testPatient.json');
const testPatient2 = require('../fixtures/fhir-resources/testPatient2.json');
const { testSetup, cleanUpTest } = require('../populateTestData');
const { client } = require('../../src/database/connection');
const supportedResources = require('../../src/server/supportedResources');

let server;

describe('resource count', () => {
  beforeAll(() => {
    const config = buildConfig();
    server = initialize(config);
  });
  beforeEach(async () => {
    const dataToImport = [testMeasure, testLibrary, testPatient, testPatient2];
    await testSetup(dataToImport);
  });
  test('test for meta.lastUpdated inclusion when not included in update request', async () => {
    await supertest(server.app)
      .get('/4_0_1/resourceCount')
      .set('Accept', 'application/json+fhir')
      .expect(200)
      .then(response => {
        expect(response.body.Library).toEqual(1);
        expect(response.body.Measure).toEqual(1);
        expect(response.body.Patient).toEqual(2);
      });
  });
  afterAll(cleanUpTest);
});

describe('test that all empty collections return count 0', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    await client.connect();
  });
  test('test for meta.lastUpdated inclusion when not included in update request', async () => {
    await supertest(server.app)
      .get('/4_0_1/resourceCount')
      .set('Accept', 'application/json+fhir')
      .expect(200)
      .then(response => {
        supportedResources.forEach(resourceType => {
          expect(response.body[resourceType]).toBeDefined();
          expect(response.body[resourceType]).toEqual(0);
        });
      });
  });
  afterAll(cleanUpTest);
});
