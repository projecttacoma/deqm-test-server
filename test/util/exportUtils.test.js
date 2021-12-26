const { retrieveExportUrl } = require('../../src/util/exportUtils');
const exportWithTypeParams = require('../fixtures/fhir-resources/parameters/paramExportUrlWithTypes.json');

const ASSEMBLED_EXPORT_URL = 'http://example.com/$export?_type=Patient,Encounter,Condition';

describe('Test export Url configuration with type parameters', () => {
  test('retrieveExportUrl successfully includes type params as comma-delimited string', () => {
    expect(retrieveExportUrl(exportWithTypeParams.parameter)).toEqual(ASSEMBLED_EXPORT_URL);
  });
});
