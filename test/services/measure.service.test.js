require('../../src/config/envConfig');
const supertest = require('supertest');
const testMeasure = require('../fixtures/fhir-resources/testMeasure.json');
const testLibrary = require('../fixtures/fhir-resources/testLibrary.json');
const testPatient = require('../fixtures/fhir-resources/testPatient.json');
const testParam = require('../fixtures/fhir-resources/parameters/paramNoExport.json');
const testParamTwoExports = require('../fixtures/fhir-resources/parameters/paramTwoExports.json');
const testParamNoValString = require('../fixtures/fhir-resources/parameters/paramNoValueUrl.json');
const testParamInvalidResourceType = require('../fixtures/fhir-resources/parameters/paramInvalidType.json');
const testEmptyParam = require('../fixtures/fhir-resources/parameters/emptyParam.json');
const testParamTwoMeasureReports = require('../fixtures/fhir-resources/parameters/paramTwoMeasureReports.json');
const testCareGapsMeasureReport = require('../fixtures/testCareGapsMeasureReport.json');
const { testSetup, cleanUpTest } = require('../populateTestData');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const testParamResource = require('../fixtures/fhir-resources/parameters/paramNoExportResource.json');

const config = buildConfig();
const server = initialize(config);
const updateMeasure = { resourceType: 'Measure', id: 'testMeasure', name: 'anUpdate' };

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
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
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
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200)
      .then(async response => {
        // Check the response
        expect(response.headers.location).toBeDefined();
      });
  });

  test('removing the measure from the database when the measure is indeed present', async () => {
    await supertest(server.app).delete('/4_0_1/Measure/testMeasure').expect(204);
  });

  afterAll(cleanUpTest);
});

describe('bulkImport with exportUrl', () => {
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

  test('FHIR Parameters object is missing valueUrl for export URL', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testParamNoValString)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(400);
  });

  afterAll(cleanUpTest);
});

describe('testing custom measure operation', () => {
  beforeAll(async () => {
    await testSetup(testMeasure, testPatient, testLibrary);
  });

  test('$submit-data returns 400 for incorrect resourceType', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testParamInvalidResourceType)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(400)
      .then(async response => {
        expect(response.body.issue[0].code).toEqual('BadRequest');
        expect(response.body.issue[0].details.text).toEqual(
          `Expected 'resourceType: Parameters'. Received 'type: InvalidType'.`
        );
      });
  });

  test('$submit-data returns 400 for empty parameter body', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testEmptyParam)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(400)
      .then(async response => {
        expect(response.body.issue[0].code).toEqual('BadRequest');
        expect(response.body.issue[0].details.text).toEqual(
          `Unreadable or empty entity for attribute 'parameter'. Received: undefined`
        );
      });
  });

  test('$submit-data returns 400 for invalid number of measure reports', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testParamTwoMeasureReports)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(400)
      .then(async response => {
        expect(response.body.issue[0].code).toEqual('BadRequest');
        expect(response.body.issue[0].details.text).toEqual(
          `Expected exactly one resource with name: 'measureReport' and/or resourceType: 'MeasureReport. Received: 2`
        );
      });
  });

  test.only('$submit-data uploads txn bundle for valid parameters request', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testParam)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200)
      .then(async response => {
        expect(response.body.entry[0].response.status).toEqual('201 Created');
        expect(response.body.resourceType).toEqual('Bundle');
        expect(response.body.type).toEqual('transaction-response');
      });
  });

  test('$submit-data uploads txn bundle for valid parameters request with resource', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/$submit-data')
      .send(testParamResource)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
      .expect(200)
      .then(async response => {
        expect(response.body.entry[0].response.status).toEqual('201 Created');
        expect(response.body.resourceType).toEqual('Bundle');
        expect(response.body.type).toEqual('transaction-response');
      });
  });

  test('$evaluate-measure returns 200 when subject is omitted and reportType is set to population', async () => {
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

  test('$evaluate-measure returns 200 when reportType is not set', async () => {
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
        subject: 'testPatient'
      })
      .expect(200);
    expect(mrSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      measurementPeriodStart: '01-01-2020',
      measurementPeriodEnd: '01-01-2021',
      reportType: 'individual'
    });
  });

  test('$data-requirements returns 400 when required param is omitted', async () => {
    const { Calculator } = require('fqm-execution');
    jest.spyOn(Calculator, 'calculateDataRequirements').mockImplementation(() => ({ results: null }));
    await supertest(server.app)
      .get('/4_0_1/Measure/testMeasure/$data-requirements')
      .query({
        periodEnd: '01-01-2021'
      })
      .expect(400);
  });
  test('$data-requirements returns 200 with valid params', async () => {
    const { Calculator } = require('fqm-execution');
    jest.spyOn(Calculator, 'calculateDataRequirements').mockImplementation(() => ({ results: null }));
    await supertest(server.app)
      .get('/4_0_1/Measure/testMeasure/$data-requirements')
      .query({
        periodStart: '01-01-2020',
        periodEnd: '01-01-2021'
      })
      .expect(200);
  });

  test('$care-gaps returns 200 with valid params', async () => {
    const { Calculator } = require('fqm-execution');
    const gapsSpy = jest.spyOn(Calculator, 'calculateGapsInCare').mockImplementation(() => {
      return {
        results: testCareGapsMeasureReport
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
      .get('/4_0_1/Measure/$care-gaps')
      .query({
        measureId: 'testMeasure',
        subject: 'testPatient',
        periodStart: '01-01-2020',
        periodEnd: '01-01-2021',
        status: 'open'
      })
      .expect(200);

    expect(gapsSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      measurementPeriodStart: '01-01-2020',
      measurementPeriodEnd: '01-01-2021'
    });
  });

  test('bulk import fails if measure bundle cannot be found', async () => {
    await supertest(server.app)
      .post('/4_0_1/Measure/invalid-id/$submit-data')
      .send(testParam)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .set('prefer', 'respond-async')
      .expect(404)
      .then(async response => {
        expect(response.body.issue[0].code).toEqual('ResourceNotFound');
        expect(response.body.issue[0].details.text).toEqual('Measure with id invalid-id does not exist in the server');
      });
  });

  afterAll(cleanUpTest);
});
