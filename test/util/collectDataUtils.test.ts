//@ts-nocheck
const { Calculator } = require('fqm-execution');
const bundleUtils = require('../../src/util/bundleUtils');
const { patientSpecificDataRequirements } = require('../../src/util/collectDataUtils');

jest.mock('../../src/util/bundleUtils');

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
    const dataRequirementsOutput = {
      results: {
        resourceType: 'Library',
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/library-type',
              code: 'module-definition'
            }
          ]
        },
        dataRequirement: [
          {
            type: 'Coverage',
            codeFilter: [
              {
                path: 'subject',
                valueSet: 'http://example.com/ValueSet/exampleVS'
              }
            ],
            extension: [
              {
                url: 'http://hl7.org/fhir/us/cqfmeasures/StructureDefinition/cqfm-fhirQueryPattern',
                valueString: '/Coverage?type=1,2,3&policy-holder=Patient/{{context.patientId}}'
              },
              {
                url: 'http://hl7.org/fhir/us/cqfmeasures/StructureDefinition/cqfm-fhirQueryPattern',
                valueString: '/Coverage?type=1,2,3&subscriber=Patient/{{context.patientId}}'
              }
            ]
          },
          {
            type: 'Encounter',
            codeFilter: [
              {
                path: 'type',
                valueSet: 'http://exmaple.com/ValueSet/exampleVS'
              }
            ],
            dateFilter: [
              {
                path: 'period',
                valuePeriod: {
                  start: '2026-01-01T00:00:00.000Z',
                  end: '2026-12-31T00:00:00.000Z'
                }
              }
            ],
            extension: [
              {
                url: 'http://hl7.org/fhir/us/cqfmeasures/StructureDefinition/cqfm-fhirQueryPattern',
                valueString:
                  '/Encounter?type=1,2,3&date=ge2026-01-01T00:00:00.000Z&date=le2026-12-31T00:00:00.000Z&patient=Patient/{{context.patientId}}'
              }
            ]
          }
        ]
      }
    };

    bundleUtils.getMeasureBundleFromId.mockResolvedValue(measureBundle);
    jest.spyOn(Calculator, 'calculateDataRequirements').mockResolvedValue(dataRequirementsOutput);

    const result = await patientSpecificDataRequirements('measure-1', 'patient-123', { useExpandedCodeQueries: true });

    expect(bundleUtils.getMeasureBundleFromId).toHaveBeenCalledWith('measure-1');
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
