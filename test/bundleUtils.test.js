const { replaceReferences, getPatientDataBundle, getQueryFromReference } = require('../src/util/bundleUtils');
const supertest = require('supertest');
const { buildConfig } = require('../src/util/config');
const { initialize } = require('../src/server/server');
const { client } = require('../src/util/mongo');
const { cleanUpDb } = require('./populateTestData');
const {
  URN_REPLACE_REFERENCES_ENTRIES,
  RESOURCETYPE_REPLACE_REFERENCES_ENTRIES,
  BOTH_REPLACE_REFERENCES_ENTRIES,
  EXPECTED_REPLACE_REFERENCES_OUTPUT,
  EXPECTED_FAILED_REPLACE_REFERENCES_OUTPUT
} = require('./bundleUtilFixtures');
const config = buildConfig();
const server = initialize(config);
const testBundle = require('./fixtures/testBundle.json');
const testDataReq = require('./fixtures/testDataReq.json');
const testNestedBundle = require('./fixtures/testNestedBundle.json');
const { v4: uuidv4 } = require('uuid');

jest.mock('uuid', () => {
  return {
    v4: jest.fn()
  };
});

describe('Testing functionality of all functions which run uuidv4', () => {
  // mocks uuidv4 to return a unique but predictable value for each resource in the resource array
  const init = resources =>
    resources.forEach((res, i) => {
      uuidv4.mockImplementationOnce(() => `${res.resource.resourceType}-${i}`);
    });
  describe('Testing functionality of bundleUtils for urn:uuid-style references', () => {
    beforeEach(() => {
      init(URN_REPLACE_REFERENCES_ENTRIES);
    });
    test('Check that replaceReference works on urn:uuid style references', () => {
      expect(replaceReferences(URN_REPLACE_REFERENCES_ENTRIES)).toEqual(EXPECTED_REPLACE_REFERENCES_OUTPUT);
    });
  });
  describe('Testing functionality of bundleUtils for resourceType/resourceID style references', () => {
    beforeEach(() => {
      init(RESOURCETYPE_REPLACE_REFERENCES_ENTRIES);
    });
    test('Check that replaceReference works on resourceType/resourceId style references', () => {
      expect(replaceReferences(RESOURCETYPE_REPLACE_REFERENCES_ENTRIES)).toEqual(EXPECTED_REPLACE_REFERENCES_OUTPUT);
    });
  });
  describe('Testing functionality of bundleUtils for both style references in same entries array', () => {
    beforeEach(() => {
      init(BOTH_REPLACE_REFERENCES_ENTRIES);
    });
    test('Check that replaceReference does not replace ref on reference: resourceType/resourceId -> fullUrl: urn:uuid: resourceId', () => {
      expect(replaceReferences(BOTH_REPLACE_REFERENCES_ENTRIES)).toEqual(EXPECTED_FAILED_REPLACE_REFERENCES_OUTPUT);
    });
  });
});
describe('Testing dynamic querying for patient references using compartment definition', () => {
  beforeAll(async () => {
    await client.connect();
  });

  afterAll(async () => {
    await cleanUpDb();
  });
  test('Check that patient reference can be found at one level', async () => {
    await supertest(server.app)
      .post('/4_0_1/')
      .send(testBundle)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(200);
    const patientBundle = await getPatientDataBundle('test-patient', testDataReq);
    const procedure = patientBundle.entry.filter(e => e.resource.resourceType === 'Procedure')[0];
    const reference = procedure.resource.subject;
    expect(reference).toEqual({ reference: 'Patient/test-patient' });
  });

  test('Check that patient reference can be found when nested', async () => {
    await supertest(server.app)
      .post('/4_0_1/')
      .send(testNestedBundle)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(200);
    const patientBundle = await getPatientDataBundle('test-patient', testDataReq);
    const procedure = patientBundle.entry.filter(e => e.resource.resourceType === 'Procedure')[0];
    const reference = procedure.resource.performer.actor;
    expect(reference).toEqual({ reference: 'Patient/test-patient' });
  });
});

describe('Testing getQueryFromReference', () => {
  test('test getQueryFromReference with canonical url', () => {
    const TEST_REF = 'http://hl7.org/fhir/StructureDefinition/Patient';
    expect(getQueryFromReference(TEST_REF)).toEqual({ url: TEST_REF });
  });

  test('test getQueryFromReference with canonical url containing |', () => {
    const TEST_REF = 'http://hl7.org/fhir/StructureDefinition/Patient|3.5.0';
    expect(getQueryFromReference(TEST_REF)).toEqual({
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      version: '3.5.0'
    });
  });
});
