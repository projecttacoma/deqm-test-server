//@ts-nocheck 
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

describe('populated collections counts', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    const dataToImport = [testMeasure, testLibrary, testPatient, testPatient2];
    await testSetup(dataToImport);
  });
  test('test that populated collections return expected counts', async () => {
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

describe('empty collections count', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    await client.connect();
  });
  test('test that all empty collections return count of 0', async () => {
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
