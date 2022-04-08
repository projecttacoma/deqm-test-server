require('../../src/config/envConfig');
const testBundle = require('../fixtures/fhir-resources/testBundle.json');
const { ScaledCalculation } = require('../../src/queue/execQueue');
const { cleanUpTest } = require('../populateTestData');

describe('execQueue', () => {
  describe('ScaledCalculation', () => {
    test('Prepares even number of jobs less than max job size even', () => {
      const calc = new ScaledCalculation(
        testBundle,
        ['pat0', 'pat1', 'pat2', 'pat3', 'pat4', 'pat5', 'pat6', 'pat7'],
        '2019-01-01',
        '2019-12-31'
      );
      expect(calc._jobs.length).toEqual(4);
      expect(calc._jobs[0]).toEqual({
        patientIds: ['pat0', 'pat1'],
        measureId: 'test-measure',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31'
      });
      expect(calc._jobs[1]).toEqual({
        patientIds: ['pat2', 'pat3'],
        measureId: 'test-measure',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31'
      });
      expect(calc._jobs[2]).toEqual({
        patientIds: ['pat4', 'pat5'],
        measureId: 'test-measure',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31'
      });
      expect(calc._jobs[3]).toEqual({
        patientIds: ['pat6', 'pat7'],
        measureId: 'test-measure',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31'
      });
    });

    test('Prepares odd number of jobs less than max job size even', () => {
      const calc = new ScaledCalculation(
        testBundle,
        ['pat0', 'pat1', 'pat2', 'pat3', 'pat4', 'pat5', 'pat6'],
        '2019-01-01',
        '2019-12-31'
      );
      expect(calc._jobs.length).toEqual(4);
      expect(calc._jobs[0]).toEqual({
        patientIds: ['pat0', 'pat1'],
        measureId: 'test-measure',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31'
      });
      expect(calc._jobs[1]).toEqual({
        patientIds: ['pat2', 'pat3'],
        measureId: 'test-measure',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31'
      });
      expect(calc._jobs[2]).toEqual({
        patientIds: ['pat4', 'pat5'],
        measureId: 'test-measure',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31'
      });
      expect(calc._jobs[3]).toEqual({
        patientIds: ['pat6'],
        measureId: 'test-measure',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31'
      });
    });

    test('Prepares more jobs than workers if n/workers is more than limit', () => {
      const patientIds = Array.from({ length: 150 }, (_, i) => `pat${i}`);

      const calc = new ScaledCalculation(testBundle, patientIds, '2019-01-01', '2019-12-31');
      expect(calc._jobs.length).toEqual(6);
      expect(calc._jobs[0].patientIds[0]).toEqual('pat0');
      expect(calc._jobs[0].patientIds[24]).toEqual('pat24');
      expect(calc._jobs[1].patientIds[0]).toEqual('pat25');
      expect(calc._jobs[1].patientIds[24]).toEqual('pat49');
      expect(calc._jobs[5].patientIds[0]).toEqual('pat125');
      expect(calc._jobs[5].patientIds[24]).toEqual('pat149');
    });

    test('Fails to set up calculation if measure bundle is bad', () => {
      expect(() => {
        new ScaledCalculation(
          { resourceType: 'Bundle', entry: [{ resource: { resourceType: 'Observation' } }] },
          ['pat1'],
          '2019-01-01',
          '2019-12-31'
        );
      }).toThrow('Could not prepare report builder:');
    });

    test('Throws an error if scaled calculation is disabled', () => {
      const workers = process.env.EXEC_WORKERS;
      process.env.EXEC_WORKERS = 0;
      expect(() => {
        new ScaledCalculation(testBundle, ['pat1'], '2019-01-01', '2019-12-31');
      }).toThrow('Scalable Calculation is disabled. To enable set EXEC_WORKERS to a value greater than 0.');
      process.env.EXEC_WORKERS = workers;
    });
  });

  afterAll(cleanUpTest);
});
