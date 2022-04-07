require('../../src/config/envConfig');
const testBundle = require('../fixtures/fhir-resources/testBundle.json');
const testMeasureBundle = require('../fixtures/fhir-resources/testMeasureBundle.json');
const testCalcResults = require('../fixtures/testCalcResults.json');
const { ScaledCalculation } = require('../../src/queue/execQueue');
const { cleanUpTest } = require('../populateTestData');
const execWorker = require('../../src/server/execWorker');
const bundleUtils = require('../../src/util/bundleUtils');
const patientUtils = require('../../src/util/patientUtils');

jest.mock('../../src/util/bundleUtils');
jest.mock('../../src/util/patientUtils');

describe('execWorker', () => {
  describe('process', () => {
    test('Executes measures', async () => {
      // Configure spy mocks for fqm-execution functions.
      const { Calculator } = require('fqm-execution');
      const calcSpy = jest.spyOn(Calculator, 'calculate').mockImplementation(async () => {
        return testCalcResults;
      });
      const drSpy = jest.spyOn(Calculator, 'calculateDataRequirements').mockImplementation(async () => {
        return {
          results: {
            resourceType: 'Library',
            type: {
              coding: [{ code: 'module-definition', system: 'http://terminology.hl7.org/CodeSystem/library-type' }]
            },
            status: 'draft',
            dataRequirement: []
          }
        };
      });

      // Configure the spy mocks for mongo functions used by the worker
      bundleUtils.getMeasureBundleFromId.mockResolvedValue(testMeasureBundle);
      patientUtils.getPatientDataCollectionBundle.mockResolvedValue(testBundle);

      // Created scaled calculation for 8 patients. This should create 4 jobs that will get run by one processor.
      const calc = new ScaledCalculation(
        testMeasureBundle,
        ['pat0', 'pat1', 'pat2', 'pat3', 'pat4', 'pat5', 'pat6', 'pat7'],
        '2019-01-01',
        '2019-12-31'
      );

      // Wait for MeasureReport to come back
      const measureReport = await calc.execute();

      // Calculation should have happened 4 times
      expect(calcSpy.mock.calls.length).toBe(4);

      // Fetching measure bundle and calculating data requirements should have happened only once because of cache
      expect(drSpy.mock.calls.length).toBe(1);
      expect(bundleUtils.getMeasureBundleFromId.mock.calls.length).toBe(1);

      // Patient data should have been collected 8 times and there should be 8 patients in the IPP
      expect(patientUtils.getPatientDataCollectionBundle.mock.calls.length).toBe(8);
      expect(measureReport.group[0].population[0].count).toBe(8);
    });
  });

  afterAll(() => {
    execWorker.close();
    cleanUpTest();
  });
});
