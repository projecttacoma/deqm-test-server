const { checkRequiredParams } = require('../src/util/measureOperationsUtils');

describe('measureOperationsUtils functions', () => {
  test('check checkRequiredParams throws error on missing params', () => {
    const req = { query: {} };
    const REQUIRED_PARAMS = ['test', 'test2'];
    try {
      checkRequiredParams(req, REQUIRED_PARAMS, 'test');
      throw new Error('checkRequiredParams failed to fail');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(`Missing required parameters for test: test, test2.`);
    }
  });

  test('check checkRequiredParams succeeds on valid params', () => {
    const req = { query: { test: true, test2: true } };
    const REQUIRED_PARAMS = ['test', 'test2'];
    checkRequiredParams(req, REQUIRED_PARAMS, 'test');
  });
});
