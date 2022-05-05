const { retrieveExportUrl, checkExportUrlArray } = require('../../src/util/exportUtils');
const exportWithTypeParams = require('../fixtures/fhir-resources/parameters/paramExportUrlWithTypes.json');
const exportWithTypeAndFilterParams = require('../fixtures/fhir-resources/parameters/paramExportUrlWithTypesAndFilters.json');
const exportWithTypeFilterParams = require('../fixtures/fhir-resources/parameters/paramExportUrlWithTypeFilter.json');

const ASSEMBLED_EXPORT_URL = 'http://example.com/$export?_type=Patient,Encounter,Condition';
const ASSEMBLED_EXPORT_URL_WITH_FILTER_MULTIPLE_TYPES =
  'http://example.com/$export?_type=Patient,Encounter,Condition&_typeFilter=Encounter%3Fcode%3Ain=TEST_VALUE_SET';
const ASSEMBLED_EXPORT_URL_WITH_FILTER =
  'http://example.com/$export?_type=Encounter&_typeFilter=Encounter%3Fcode%3Ain=TEST_VALUE_SET';
describe('Test export Url configuration with type and typeFileter parameters', () => {
  test('retrieveExportUrl successfully includes type params as comma-delimited string', () => {
    expect(retrieveExportUrl(exportWithTypeParams.parameter)).toEqual(ASSEMBLED_EXPORT_URL);
  });

  test('retrieveExportUrl successfully includes type and typeFilter params from bulk submit data request', () => {
    expect(retrieveExportUrl(exportWithTypeAndFilterParams.parameter)).toEqual(
      ASSEMBLED_EXPORT_URL_WITH_FILTER_MULTIPLE_TYPES
    );
  });

  test('retrieveExportUrl successfully includes typeFilter param when type param already included in export url', () => {
    expect(retrieveExportUrl(exportWithTypeFilterParams.parameter)).toEqual(ASSEMBLED_EXPORT_URL_WITH_FILTER);
  });
});

describe('Test checkExportUrlArray', () => {
  test('does not throw error for valid input', () => {
    expect(checkExportUrlArray([{ name: 'exportUrl', valueUrl: 'http://www.example.com' }])).toBeUndefined();
  });
  test('throws BadRequest error for missing export url parameter', () => {
    try {
      expect(checkExportUrlArray([]));
      expect.fail('checkExportUrl failed to throw error for missing export url parameter');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('No exportUrl parameter was found.');
    }
  });
  test('throws BadRequest error for multiple export urls', () => {
    try {
      expect(
        checkExportUrlArray([
          { name: 'exportUrl', valueUrl: 'http://www.example.com' },
          { name: 'exportUrl', valueUrl: 'http://www.example2.com' }
        ])
      );
      expect.fail('checkExportUrl failed to throw error for multiple export url parameters');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('Expected exactly one export URL. Received: 2');
    }
  });
  test('throws BadRequest error for parameter with no valueUrl', () => {
    try {
      expect(checkExportUrlArray([{ name: 'exportUrl' }]));
      expect.fail('checkExportUrl failed to throw error for parameter with no valueUrl');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('Expected a valueUrl for the exportUrl, but none was found');
    }
  });
});
