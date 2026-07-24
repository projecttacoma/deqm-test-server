//@ts-nocheck
const { Calculator } = require('fqm-execution');
const { patientSpecificDataRequirements, getPatientIds } = require('../../src/util/measureUtils');
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

describe('getPatientIds', () => {
  test('error thrown for subjectGroup with non-Patient reference members', async () => {
    expect.assertions(2);
    const subjectGroup = {
      resourceType: 'Group',
      id: 'testGroup',
      type: 'person',
      actual: 'true',
      member: [
        {
          entity: {
            reference: 'Patient/testPatient'
          }
        },
        {
          entity: {
            reference: 'Medication/testMedication'
          }
        }
      ]
    };

    try {
      await getPatientIds(null, subjectGroup);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        'Group members may only be Patient resource references of format "Patient/{id}".'
      );
    }
  });

  test('error thrown for subjectGroup with members missing references', async () => {
    expect.assertions(2);
    const subjectGroup = {
      resourceType: 'Group',
      id: 'testGroup',
      type: 'person',
      actual: 'true',
      member: [
        {
          entity: {
            reference: 'Patient/testPatient'
          }
        },
        {}
      ]
    };
    try {
      await getPatientIds(null, subjectGroup);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('Group members must have references to Patients.');
    }
  });

  test('error thrown for subjectGroup without members list', async () => {
    expect.assertions(2);
    const subjectGroup = {
      resourceType: 'Group',
      id: 'testGroup',
      type: 'person',
      actual: 'true'
    };
    try {
      await getPatientIds(null, subjectGroup);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('Parameter subjectGroup or referenced Group must contain members.');
    }
  });
});
