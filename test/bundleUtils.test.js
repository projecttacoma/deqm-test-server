const { replaceReferences } = require('../src/util/bundleUtils');
const {
  URN_REPLACE_REFERENCES_ENTRIES,
  RESOURCETYPE_REPLACE_REFERENCES_ENTRIES,
  BOTH_REPLACE_REFERENCES_ENTRIES,
  EXPECTED_REPLACE_REFERENCES_OUTPUT
} = require('./bundleUtilConsts');
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
    test('Check that replaceReference works on urn:uuid style references', () => {
      expect(replaceReferences(RESOURCETYPE_REPLACE_REFERENCES_ENTRIES)).toEqual(EXPECTED_REPLACE_REFERENCES_OUTPUT);
    });
  });
  describe('Testing functionality of bundleUtils for resourceType/resourceID style references', () => {
    beforeEach(() => {
      init(RESOURCETYPE_REPLACE_REFERENCES_ENTRIES);
    });
    test('Check that replaceReference works on urn:uuid style references', () => {
      expect(replaceReferences(RESOURCETYPE_REPLACE_REFERENCES_ENTRIES)).toEqual(EXPECTED_REPLACE_REFERENCES_OUTPUT);
    });
  });
  describe('Testing functionality of bundleUtils for both style references in same entries array', () => {
    beforeEach(() => {
      init(BOTH_REPLACE_REFERENCES_ENTRIES);
    });
    test('Check that replaceReference works on urn:uuid style references', () => {
      expect(replaceReferences(BOTH_REPLACE_REFERENCES_ENTRIES)).toEqual(EXPECTED_REPLACE_REFERENCES_OUTPUT);
    });
  });
});
