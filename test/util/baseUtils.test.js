const { checkSupportedResource } = require('../../src/util/baseUtils');
const queue = require('../../src/queue/importQueue');

describe('Testing base utility functions', () => {
  test('returns true for supported resource', () => {
    expect(checkSupportedResource('Patient')).toBeUndefined();
  });
  test('Throws error for unsupported resource', () => {
    expect(() => checkSupportedResource('INVALID')).toThrow();
  });
  test('Throws error for undefined resource', () => {
    expect(() => checkSupportedResource(undefined)).toThrow();
  });
  afterAll(async () => {
    await queue.close();
  });
});
