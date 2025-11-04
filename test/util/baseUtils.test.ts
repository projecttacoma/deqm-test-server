//@ts-nocheck
const { checkSupportedResource, checkContentTypeHeader } = require('../../src/util/baseUtils');
import { importQueue } from '../../src/queue/importQueue';

describe('Testing checkSupportedResource', () => {
  test('Does not throw error for supported resource', () => {
    expect(checkSupportedResource('Patient')).toBeUndefined();
  });
  test('Throws error for unsupported resource', () => {
    try {
      checkSupportedResource('INVALID');
      expect.fail('checkSupportedResource failed to throw error when passed invalid resource type');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('resourceType: INVALID is not a supported resourceType');
    }
  });
  test('Throws error for undefined resource', () => {
    try {
      checkSupportedResource(undefined);
      expect.fail('checkSupportedResource failed to throw error when passed invalid resource type');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('resourceType: undefined is not a supported resourceType');
    }
  });
  afterAll(async () => {
    await importQueue.close();
  });
});

describe('testing checkContentTypeHeader', () => {
  test('throws error for invalid ContentType header', () => {
    const INVALID_HEADER = { 'content-type': 'INVALID' };
    try {
      checkContentTypeHeader(INVALID_HEADER);
      expect.fail('checkContentType failed to throw an error for invalidContentType Header');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        'Ensure Content-Type is set to application/json+fhir or to application/fhir+json in headers'
      );
    }
  });
  test('returns undefined for valid ContentType header', () => {
    expect(checkContentTypeHeader({ 'content-type': 'application/json+fhir' })).toBeUndefined();
    expect(checkContentTypeHeader({ 'content-type': 'application/fhir+json' })).toBeUndefined();
  });
});
