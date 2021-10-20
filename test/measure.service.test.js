require('../src/util/dbconfig');
const testMeasure = require('./fixtures/testMeasure.json');
const testLibrary = require('./fixtures/testLibrary.json');
const testPatient = require('./fixtures/testPatient.json');
const testParam = require('./fixtures/parametersObjs/paramNoExport.json');
const testParamTwoExports = require('./fixtures/parametersObjs/paramTwoExports.json');
const testParamNoValString = require('./fixtures/parametersObjs/paramNoValueString.json');
const { testSetup, cleanUpDb } = require('./populateTestData');
const supertest = require('supertest');
const { buildConfig } = require('../src/util/config');
const { initialize } = require('../src/server/server');
const config = buildConfig();
const server = initialize(config);
const updateMeasure = { id: 'testMeasure', name: 'anUpdate' };
describe('measure.service CRUD operations', () => {
  beforeAll(async () => {
    await testSetup(testMeasure, testPatient, testLibrary);
  });

  test('test create with correct headers', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure')
      .send(testMeasure)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(201)
      .then(response => {
        expect(response.headers.location).toBeDefined();
      });
  });

  test('test searchById with correctHeaders and the id should be in database', async () => {
    await supertest(server.app)
      .get('/4_0_1/Measure/testMeasure')
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(200)
      .then(async response => {
        expect(response.body.id).toEqual(testMeasure.id);
      });
  });

  test('test update with correctHeaders and the id is in database', async () => {
    await supertest(server.app)
      .put('/4_0_1/Measure/testMeasure')
      .send(updateMeasure)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(200)
      .then(async response => {
        // Check the response
        expect(response.headers.location).toBeDefined();
      });
  });

  test('removing the measure from the database when the measure is indeed present', async () => {
    await supertest(server.app).delete('/4_0_1/Measure/testMeasure').expect(204);
  });

  afterAll(async () => {
    await cleanUpDb();
  });
});

describe('bulkImport with exportURL', () => {
  beforeAll(async () => {
    await testSetup(testMeasure, testPatient, testLibrary);
  });
  test('FHIR Parameters object is missing export URL', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testParam)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(400);
  });

  test('FHIR Parameters object has two export URLs', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testParamTwoExports)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(400);
  });

  test('FHIR Parameters object is missing valueString for export URL', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testParamNoValString)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(400);
  });

  afterAll(async () => {
    await cleanUpDb();
  });
});

describe('testing $evaluate-measure operation', () => {
  beforeAll(async () => {
    await testSetup(testMeasure, testPatient, testLibrary);
  });
  test('return 200 when subject is omitted and reportType is set to population', async () => {
    const { Calculator } = require('fqm-execution');
    const mrSpy = jest.spyOn(Calculator, 'calculateMeasureReports').mockImplementation(() => {
      return {
        results: [
          {
            resourceType: 'MeasureReport',
            period: {},
            measure: '',
            status: 'complete',
            type: 'individual'
          }
        ],
        debugOutput: {}
      };
    });
    jest.spyOn(Calculator, 'calculateDataRequirements').mockImplementation(() => {
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
    await supertest(server.app)
      .get('/4_0_1/Measure/testMeasure/$evaluate-measure')
      .query({
        periodStart: '01-01-2020',
        periodEnd: '01-01-2021',
        reportType: 'population'
      })
      .expect(200);
    expect(mrSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      measurementPeriodStart: '01-01-2020',
      measurementPeriodEnd: '01-01-2021',
      reportType: 'summary'
    });
  });
  afterAll(async () => {
    await cleanUpDb();
  });
});
