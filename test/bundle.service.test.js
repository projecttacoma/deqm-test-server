const { uploadTransactionBundle } = require('../src/services/bundle.service');

const NON_BUNDLE_REQ = {
  body: { resourceType: 'invalidType', type: 'transaction' },
  params: { base_version: '4_0_1' }
};
const NON_TXN_REQ = { body: { resourceType: 'Bundle', type: 'invalidType' }, params: { base_version: '4_0_1' } };
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
