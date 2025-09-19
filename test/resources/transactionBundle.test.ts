//@ts-nocheck 
const { createTransactionBundleClass } = require('../../src/resources/transactionBundle');
const testPatient = require('../fixtures/fhir-resources/testPatient.json');
const queue = require('../../src/queue/importQueue');

describe('Test functionality for adding resource entry to the bundle', () => {
  let tb;

  beforeEach(() => {
    // initialize empty transaction bundle
    tb = createTransactionBundleClass('4_0_1');
  });
  test('POST request for adding entry from a resource', () => {
    tb.addEntryFromResource(testPatient, 'POST');
    // check that resource was added properly
    expect(tb.entry[0].resource.id).toEqual(testPatient.id);
    expect(tb.entry[0].resource.resourceType).toEqual(testPatient.resourceType);
    // check that request was added properly
    expect(tb.entry[0].request.url).toEqual(testPatient.resourceType);
    expect(tb.entry[0].request.method).toEqual('POST');
  });

  test('PUT request for adding entry from a resource', () => {
    tb.addEntryFromResource(testPatient, 'PUT');
    // check that resource was added properly
    expect(tb.entry[0].resource.id).toEqual(testPatient.id);
    expect(tb.entry[0].resource.resourceType).toEqual(testPatient.resourceType);
    // check that request was added properly
    expect(tb.entry[0].request.url).toEqual(`${testPatient.resourceType}/${testPatient.id}`);
    expect(tb.entry[0].request.method).toEqual('PUT');
  });

  test('Invalid request type received', () => {
    try {
      tb.addEntryFromResource(testPatient, 'INVALID');
      expect.fail('addEntryFromResource failed to throw error for invalid request type');
    } catch (e) {
      expect(e.statusCode).toEqual(422);
      expect(e.issue[0].details.text).toEqual(
        `Invalid request type for transaction bundle entry for resource with id: ${testPatient.id}. 
        Request must be of type POST or PUT, received type: INVALID`
      );
    }
  });

  afterAll(async () => await queue.close());
});
