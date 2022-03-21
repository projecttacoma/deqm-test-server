const { getResourceReference } = require('../../src/util/referenceUtils');

describe('getResourceReference', () => {
  test('should use resourceType/id when present', () => {
    expect(getResourceReference('myProp', 'Patient/123')).toEqual({
      'myProp.reference': 'Patient/123'
    });
  });

  test('should use identifier when present', () => {
    expect(getResourceReference('myProp', '123')).toEqual({
      'myProp.identifier.value': '123'
    });
  });

  test('should use identifier when invalid resourceType part', () => {
    expect(getResourceReference('myProp', 'NotAResource/123')).toEqual({
      'myProp.identifier.value': 'NotAResource/123'
    });
  });
});
