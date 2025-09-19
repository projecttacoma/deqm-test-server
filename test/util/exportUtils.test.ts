//@ts-nocheck 
const { checkInputUrlArray, retrieveInputUrls } = require('../../src/util/exportUtils');
const paramOneInput = require('../fixtures/fhir-resources/parameters/paramOneInput.json');
const paramTwoInputs = require('../fixtures/fhir-resources/parameters/paramTwoInputs.json');
const paramNoInputValueUrl = require('../fixtures/fhir-resources/parameters/paramNoInputValueUrl.json');

describe('Test retrieveInputUrls', () => {
  it('returns an array with one object that contains the input resource type and ndjson url', () => {
    expect(retrieveInputUrls(paramOneInput.parameter)).toEqual([
      { type: 'Example1', url: 'http://example.com/Example1.ndjson' }
    ]);
  });

  it('returns an array with two objects that contain the input resource types and ndjson urls', () => {
    expect(retrieveInputUrls(paramTwoInputs.parameter)).toEqual([
      { type: 'Example1', url: 'http://example.com/Example1.ndjson' },
      { type: 'Example2', url: 'http://example.com/Example2.ndjson' }
    ]);
  });
});

describe('Test checkInputUrlArray', () => {
  it('does not throw error for valid input', () => {
    expect(checkInputUrlArray(paramOneInput.parameter)).toBeUndefined();
  });

  it('does not throw error for valid input with multiple inputUrls', () => {
    expect(checkInputUrlArray(paramTwoInputs.parameter)).toBeUndefined();
  });

  it('throws BadRequest error for missing inputUrl parameter', () => {
    try {
      expect(checkInputUrlArray([]));
      expect.fail('checkExportUrl failed to throw error for missing export url parameter');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('No inputUrl parameters were found.');
    }
  });

  it('throws BadRequest error for parameter with no valueUrl', () => {
    try {
      expect(checkInputUrlArray(paramNoInputValueUrl.parameter));
      expect.fail('checkInputUrlArray failed to throw error for parameter with no valueUrl');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('Expected a valueUrl for the inputUrl, but none were found.');
    }
  });
});
