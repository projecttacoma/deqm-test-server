//@ts-nocheck
const { Calculator } = require('fqm-execution');
const { patientSpecificDataRequirements } = require('../../src/util/collectDataUtils');
const dataRequirementsOutput = require('../fixtures/testDataRequirementsOutput.json');

describe('patientSpecificDataRequirements', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('populates context patientId placeholders in dataRequirement extensions', async () => {
    const measureBundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: []
    };

    // this test modifies dataRequirementsOutputFixture object - do not use in other tests in this file without resetting/cloning
    jest.spyOn(Calculator, 'calculateDataRequirements').mockResolvedValue(dataRequirementsOutput);

    const result = await patientSpecificDataRequirements(measureBundle, 'patient-123', {
      useExpandedCodeQueries: true
    });

    expect(Calculator.calculateDataRequirements).toHaveBeenCalledWith(measureBundle, { useExpandedCodeQueries: true });
    expect(result.results.dataRequirement[0].extension[0].valueString).toBe(
      '/Coverage?type=1,2,3&policy-holder=Patient/patient-123'
    );
    expect(result.results.dataRequirement[0].extension[1].valueString).toBe(
      '/Coverage?type=1,2,3&subscriber=Patient/patient-123'
    );
    expect(result.results.dataRequirement[1].extension[0].valueString).toBe(
      '/Encounter?type=1,2,3&date=ge2026-01-01T00:00:00.000Z&date=le2026-12-31T00:00:00.000Z&patient=Patient/patient-123'
    );
  });
});
