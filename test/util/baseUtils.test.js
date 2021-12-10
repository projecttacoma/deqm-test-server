const { checkSupportedResource } = require('../../src/util/baseUtils');

describe('Testing base utility functions', () => {
  test('returns true for supported resource', () => {
    expect(checkSupportedResource('Patient')).toBeUndefined();
  });
  test('Throws error for unsupported resource', () => {
    expect(() => checkSupportedResource('INVALID')).toThrow();
  });
});
