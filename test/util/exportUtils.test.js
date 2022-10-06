const { retrieveExportType, retrieveExportUrl, checkExportUrlArray } = require('../../src/util/exportUtils');
const exportWithTypeParams = require('../fixtures/fhir-resources/parameters/paramExportUrlWithTypes.json');
const exportWithTypeAndFilterParams = require('../fixtures/fhir-resources/parameters/paramExportUrlWithTypesAndFilters.json');
const exportWithTypeFilterParams = require('../fixtures/fhir-resources/parameters/paramExportUrlWithTypeFilter.json');
const exportWithMultipleTypeDeclarations = require('../fixtures/fhir-resources/parameters/paramExportUrlMultipleTypeDeclarations.json');
const exportWithMultipleTypeFilterDeclarations = require('../fixtures/fhir-resources/parameters/paramExportUrlMultipleTypeFilterDeclarations.json');

const ASSEMBLED_EXPORT_URL = 'http://example.com/$export?_type=Patient,Encounter,Condition';
const ASSEMBLED_EXPORT_URL_WITH_FILTER_MULTIPLE_TYPES =
  'http://example.com/$export?_type=Patient,Encounter,Condition&_typeFilter=Encounter%3Fcode%3Ain=TEST_VALUE_SET';
const ASSEMBLED_EXPORT_URL_WITH_FILTER =
  'http://example.com/$export?_type=Encounter&_typeFilter=Encounter%3Fcode%3Ain=TEST_VALUE_SET';
const DYNAMIC_EXPORT_TYPE_PARAMETERS = {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'exportUrl',
      valueUrl: 'http://localhost:3001/$export'
    },
    {
      name: 'exportType',
      valueCode: 'dynamic'
    }
  ]
};
const NO_EXPORT_TYPE_PARAMETERS = {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'exportUrl',
      valueUrl: 'http://localhost:3001/$export'
    }
  ]
};
const STATIC_EXPORT_TYPE_PARAMETERS = {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'exportUrl',
      valueUrl: 'http://localhost:3001/$export'
    },
    {
      name: 'exportType',
      valueCode: 'static'
    }
  ]
};

describe('Test export Url configuration with type and typeFilter parameters', () => {
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

  test('console.warn thrown and _type parameter (from param array) not added when _type is already appended to exportUrl', () => {
    const warningSpy = jest.spyOn(global.console, 'warn');
    expect(retrieveExportUrl(exportWithMultipleTypeDeclarations.parameter)).toEqual(ASSEMBLED_EXPORT_URL);
    expect(warningSpy).toHaveBeenCalled();
  });

  test('console.warn thrown and _typeFilter parameter (from param array) not added when _typeFilter is already appended to exportUrl', () => {
    const warningSpy = jest.spyOn(global.console, 'warn');
    expect(retrieveExportUrl(exportWithMultipleTypeFilterDeclarations.parameter)).toEqual(
      ASSEMBLED_EXPORT_URL_WITH_FILTER
    );
    expect(warningSpy).toHaveBeenCalled();
  });

  afterEach(() => {
    jest.clearAllMocks();
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

describe('Test retrieveExportType', () => {
  test('returns dynamic if the exportType is dynamic', () => {
    expect(retrieveExportType(DYNAMIC_EXPORT_TYPE_PARAMETERS.parameter)).toEqual('dynamic');
  });
  test('returns dynamic if there is no exportTYpe', () => {
    expect(retrieveExportType(NO_EXPORT_TYPE_PARAMETERS.parameter)).toEqual('dynamic');
  });
  test('returns static if the exportType is static', () => {
    expect(retrieveExportType(STATIC_EXPORT_TYPE_PARAMETERS.parameter)).toEqual('static');
  });
});
