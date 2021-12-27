const supertest = require('supertest');
const {
  replaceReferences,
  getPatientDataCollectionBundle,
  getQueryFromReference
} = require('../../src/util/bundleUtils');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const { client } = require('../../src/database/connection');
const { cleanUpTest } = require('../populateTestData');
const queue = require('../../src/resources/importQueue');
const {
  URN_REPLACE_REFERENCES_ENTRIES,
  RESOURCETYPE_REPLACE_REFERENCES_ENTRIES,
  BOTH_REPLACE_REFERENCES_ENTRIES,
  EXPECTED_REPLACE_REFERENCES_OUTPUT,
  EXPECTED_FAILED_REPLACE_REFERENCES_OUTPUT
} = require('../fixtures/bundleUtilFixtures');
const config = buildConfig();
const server = initialize(config);
const testBundle = require('../fixtures/fhir-resources/testBundle.json');
const testNestedBundle = require('../fixtures/fhir-resources/testNestedBundle.json');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const { v4: uuidv4 } = require('uuid');

const DATA_REQ = [{ type: 'Procedure', codeFilter: [] }];

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
  afterAll(async () => {
    await queue.close();
  });
});
describe('Testing dynamic querying for patient references using compartment definition', () => {
  beforeAll(async () => {
    await client.connect();
  });

  test('Check that patient reference can be found at one level', async () => {
    await supertest(server.app)
      .post('/4_0_1/')
      .send(testBundle)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200);
    const patientBundle = await getPatientDataCollectionBundle('test-patient', DATA_REQ);
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
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200);
    const patientBundle = await getPatientDataCollectionBundle('test-patient', DATA_REQ);
    const procedure = patientBundle.entry.filter(e => e.resource.resourceType === 'Procedure')[0];
    const reference = procedure.resource.performer.actor;
    expect(reference).toEqual({ reference: 'Patient/test-patient' });
  });
  afterAll(cleanUpTest);
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
  afterAll(async () => {
    await queue.close();
  });
});
