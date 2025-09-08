require('../../src/config/envConfig');
const supertest = require('supertest');
const testMeasure = require('../fixtures/fhir-resources/testMeasure.json');
const testMeasure2 = require('../fixtures/fhir-resources/testMeasure2.json');
const testLibrary = require('../fixtures/fhir-resources/testLibrary.json');
const testPatient = require('../fixtures/fhir-resources/testPatient.json');
const testPatient2 = require('../fixtures/fhir-resources/testPatient2.json');
const testGroup = require('../fixtures/fhir-resources/testGroup.json');
const testOrganization = require('../fixtures/fhir-resources/testOrganization.json');
const testOrganization2 = require('../fixtures/fhir-resources/testOrganization2.json');
const testParam = require('../fixtures/fhir-resources/parameters/paramNoExport.json');
const paramNoInput = require('../fixtures/fhir-resources/parameters/paramNoInput.json');
const testEmptyParamList = require('../fixtures/fhir-resources/parameters/emptyParamList.json');
const paramNoInputValueUrl = require('../fixtures/fhir-resources/parameters/paramNoInputValueUrl.json');
const testParamInvalidResourceType = require('../fixtures/fhir-resources/parameters/paramInvalidType.json');
const testEmptyParam = require('../fixtures/fhir-resources/parameters/emptyParam.json');
const testParamTwoMeasureReports = require('../fixtures/fhir-resources/parameters/paramTwoMeasureReports.json');
const testCareGapsMeasureReport = require('../fixtures/testCareGapsMeasureReport.json');
const deleteMeasure = require('../fixtures/fhir-resources/deleteMeasure.json');
const { testSetup, cleanUpTest, cleanUpDb } = require('../populateTestData');
const { buildConfig } = require('../../src/config/profileConfig');
const { initialize } = require('../../src/server/server');
const { SINGLE_AGENT_PROVENANCE } = require('../fixtures/provenanceFixtures');
const testParamResource = require('../fixtures/fhir-resources/parameters/paramNoExportResource.json');
const testParam2Resources = require('../fixtures/fhir-resources/parameters/paramNoExport2Resources.json');
const testParamPartial = require('../fixtures/fhir-resources/parameters/paramNoExportPartialFailure.json');

let server;

const resetMeasureData = async () => {
  await cleanUpDb();
  const dataToImport = [
    testMeasure,
    testMeasure2,
    testPatient,
    testPatient2,
    testLibrary,
    testGroup,
    testOrganization,
    testOrganization2,
    deleteMeasure
  ];
  await testSetup(dataToImport);
};

describe('measure.service', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
    const dataToImport = [
      testMeasure,
      testMeasure2,
      testPatient,
      testPatient2,
      testLibrary,
      testGroup,
      testOrganization,
      testOrganization2,
      deleteMeasure
    ];

    await testSetup(dataToImport);
  });
  describe('CRUD operations', () => {
    test('test create with correct headers returns 201', async () => {
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

    test('test searchById with correctHeaders and the id should be in database returns 200', async () => {
      await supertest(server.app)
        .get('/4_0_1/Measure/testMeasure')
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(200)
        .then(response => {
          expect(response.body.id).toEqual(testMeasure.id);
        });
    });

    test('removing the measure from the database when the measure is indeed present returns 204', async () => {
      await supertest(server.app).delete('/4_0_1/Measure/deleteMeasure').expect(204);
    });

    test('removing the measure from the database when the measure is not present returns 204', async () => {
      await supertest(server.app).delete('/4_0_1/Measure/INVALID').expect(204);
    });
  });

  describe('$bulk-submit-data', () => {
    it('Returns 400 if FHIR Parameters object is missing input URL', async () => {
      await supertest(server.app)
        .post('/4_0_1/Measure/$bulk-submit-data')
        .send(paramNoInput)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('prefer', 'respond-async')
        .expect(400)
        .then(response => {
          expect(response.body.resourceType).toEqual('OperationOutcome');
          expect(response.body.issue[0].details.text).toEqual('No inputUrl parameters were found.');
        });
    });

    test('FHIR Parameters object is missing valueUrl for export URL', async () => {
      await supertest(server.app)
        .post('/4_0_1/Measure/$bulk-submit-data')
        .send(paramNoInputValueUrl)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('prefer', 'respond-async')
        .expect(400)
        .then(response => {
          expect(response.body.resourceType).toEqual('OperationOutcome');
          expect(response.body.issue[0].details.text).toEqual(
            'Expected a valueUrl for the inputUrl, but none were found.'
          );
        });
    });
  });

  describe('testing custom measure operation', () => {
    test('$submit-data returns 400 for incorrect resourceType', async () => {
      await supertest(server.app)
        .post('/4_0_1/Measure/$submit-data')
        .send(testParamInvalidResourceType)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(400)
        .then(response => {
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
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(
            `Unreadable or empty entity for attribute 'parameter'. Received: undefined`
          );
        });
    });

    test('$submit-data returns 400 for empty parameter list', async () => {
      await supertest(server.app)
        .post('/4_0_1/Measure/$submit-data')
        .send(testEmptyParamList)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(`Expected 1..* bundles. Received: 0`);
        });
    });

    test('$submit-data returns 400 for invalid type within parameters', async () => {
      await supertest(server.app)
        .post('/4_0_1/Measure/$submit-data')
        .send(testParamTwoMeasureReports)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(
            `Unexpected parameter included in request. All parameters for the $submit-data operation must be named bundle with type Bundle.`
          );
        });
    });

    test('$submit-data uploads txn bundle for valid parameters request', async () => {
      await supertest(server.app)
        .post('/4_0_1/Measure/$submit-data')
        .send(testParam)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(200)
        .then(response => {
          expect(response.body.parameter[0].resource.entry[0].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.resourceType).toEqual('Bundle');
          expect(response.body.parameter[0].resource.type).toEqual('transaction-response');
        });
      await resetMeasureData(); // reset to base db
    });

    test('$submit-data uploads txn bundle for valid parameters request with bundle with resource', async () => {
      await supertest(server.app)
        .post('/4_0_1/Measure/$submit-data')
        .send(testParamResource)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(200)
        .then(response => {
          expect(response.body.parameter[0].resource.entry[0].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.entry[1].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.resourceType).toEqual('Bundle');
          expect(response.body.parameter[0].resource.type).toEqual('transaction-response');
        });
      await resetMeasureData(); // reset to base db
    });

    test('$submit-data uploads 2 txn bundles for 2 patients with 2 referenced measures', async () => {
      await supertest(server.app)
        .post('/4_0_1/Measure/$submit-data')
        .send(testParam2Resources)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(200)
        .then(response => {
          expect(response.body.parameter[0].resource.entry[0].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.entry[1].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.entry[2].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.entry[3].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.resourceType).toEqual('Bundle');
          expect(response.body.parameter[0].resource.type).toEqual('transaction-response');
          expect(response.body.parameter[1].resource.entry[0].response.status).toEqual('201 Created');
          expect(response.body.parameter[1].resource.entry[1].response.status).toEqual('201 Created');
          expect(response.body.parameter[1].resource.entry[2].response.status).toEqual('201 Created');
          expect(response.body.parameter[1].resource.entry[3].response.status).toEqual('201 Created');
          expect(response.body.parameter[1].resource.resourceType).toEqual('Bundle');
          expect(response.body.parameter[1].resource.type).toEqual('transaction-response');
        });
      await resetMeasureData(); // reset to base db
    });

    test('$submit-data upload returns a transaction bundle response with a partial success', async () => {
      await supertest(server.app)
        .post('/4_0_1/Measure/$submit-data')
        .send(testParamPartial)
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(200)
        .then(response => {
          expect(response.body.parameter[0].resource.entry[0].response.status).toEqual('400 BadRequest');
          expect(response.body.parameter[0].resource.entry[1].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.entry[2].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.entry[3].response.status).toEqual('201 Created');
          expect(response.body.parameter[0].resource.resourceType).toEqual('Bundle');
          expect(response.body.parameter[0].resource.type).toEqual('transaction-response');
        });
      await resetMeasureData(); // reset to base db
    });

    test('$evaluate returns 200 when subject is omitted and reportType is set to population', async () => {
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
        .get('/4_0_1/Measure/testMeasure/$evaluate')
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

    test('$evaluate returns 200 for population report type for multiple measures', async () => {
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
        .post('/4_0_1/Measure/$evaluate')
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'periodStart',
              valueString: '01-01-2020'
            },
            {
              name: 'periodEnd',
              valueString: '01-01-2021'
            },
            {
              name: 'reportType',
              valueString: 'population'
            },
            {
              name: 'measureId',
              valueString: 'testMeasure'
            },
            {
              name: 'measureId',
              valueString: 'testMeasure2'
            }
          ]
        })
        .set('Accept', 'application/json+fhir')
        .set('content-type', 'application/json+fhir')
        .set('x-provenance', JSON.stringify(SINGLE_AGENT_PROVENANCE))
        .expect(200);
      expect(mrSpy).toHaveBeenCalledWith(
        {
          entry: [
            {
              resource: {
                _id: expect.anything(),
                id: 'testMeasure',
                library: ['Library/testLibrary'],
                resourceType: 'Measure'
              }
            },
            {
              resource: {
                _id: expect.anything(),
                id: 'testLibrary',
                library: ['Library/testLibrary'],
                resourceType: 'Library'
              }
            }
          ],
          resourceType: 'Bundle',
          type: 'collection'
        },
        expect.anything(),
        {
          measurementPeriodStart: '01-01-2020',
          measurementPeriodEnd: '01-01-2021',
          reportType: 'summary'
        }
      );
      expect(mrSpy).toHaveBeenCalledWith(
        {
          entry: [
            {
              resource: {
                _id: expect.anything(),
                id: 'testMeasure2',
                library: ['Library/testLibrary'],
                resourceType: 'Measure',
                useContext: expect.anything()
              }
            },
            {
              resource: {
                _id: expect.anything(),
                id: 'testLibrary',
                library: ['Library/testLibrary'],
                resourceType: 'Library'
              }
            }
          ],
          resourceType: 'Bundle',
          type: 'collection'
        },
        expect.anything(),
        {
          measurementPeriodStart: '01-01-2020',
          measurementPeriodEnd: '01-01-2021',
          reportType: 'summary'
        }
      );
    });

    test('$evaluate returns 200 when subject is existing group and reportType is set to population', async () => {
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
        .get('/4_0_1/Measure/testMeasure/$evaluate')
        .query({
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          reportType: 'population',
          subject: 'Group/testGroup'
        })
        .expect(200);
      expect(mrSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021',
        reportType: 'summary'
      });
    });

    test('$evaluate returns 200 when subjectGroup is provided and reportType is set to population', async () => {
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
        .post('/4_0_1/Measure/$evaluate')
        .send({
          resourceType: 'Parameters',
          parameter: [
            {
              name: 'periodStart',
              valueString: '01-01-2020'
            },
            {
              name: 'periodEnd',
              valueString: '01-01-2021'
            },
            {
              name: 'reportType',
              valueString: 'population'
            },
            {
              name: 'measureId',
              valueString: 'testMeasure'
            },
            {
              name: 'subjectGroup',
              resource: testGroup
            }
          ]
        })
        .expect(200);
      expect(mrSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021',
        reportType: 'summary'
      });
    });

    test('$evaluate should default to reportType population when not set and no subject provided', async () => {
      const { Calculator } = require('fqm-execution');
      const mrSpy = jest.spyOn(Calculator, 'calculateMeasureReports').mockImplementation(() => {
        return {
          results: [
            {
              resourceType: 'MeasureReport',
              period: {},
              measure: '',
              status: 'complete',
              type: 'summary'
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
        .get('/4_0_1/Measure/testMeasure/$evaluate')
        .query({
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021'
        })
        .expect(200);

      expect(mrSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021',
        reportType: 'summary'
      });
    });

    test('$evaluate should default to reportType subject when not set and subject is provided', async () => {
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
        .get('/4_0_1/Measure/testMeasure/$evaluate')
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

    test('$evaluate returns 200 when passed a practitioner referenced by a Patient subject, individual report type', async () => {
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
        .get('/4_0_1/Measure/testMeasure/$evaluate')
        .query({
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          reportType: 'subject',
          subject: 'testPatient',
          practitioner: 'Practitioner/testPractitioner'
        })
        .expect(200);
      expect(mrSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021',
        reportType: 'individual'
      });
    });

    test('$evaluate returns 200 when passed a practitioner referenced by a patient in the Group subject, population report type', async () => {
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
        .get('/4_0_1/Measure/testMeasure/$evaluate')
        .query({
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          reportType: 'population',
          subject: 'Group/testGroup',
          practitioner: 'Practitioner/testPractitioner'
        })
        .expect(200);
      expect(mrSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021',
        reportType: 'summary'
      });
    });

    test('$evaluate returns 200 when passed a practitioner referenced by a patient, population report type, no subject', async () => {
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
        .get('/4_0_1/Measure/testMeasure/$evaluate')
        .query({
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          reportType: 'population',
          practitioner: 'Practitioner/testPractitioner'
        })
        .expect(200);
      expect(mrSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021',
        reportType: 'summary'
      });
    });

    test('$evaluate returns 400 when practitioner is not referenced by Patient subject, individual report type', async () => {
      await supertest(server.app)
        .get('/4_0_1/Measure/testMeasure/$evaluate')
        .query({
          reportType: 'subject',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          subject: 'testPatient',
          practitioner: 'Practitioner/BAD_REFERENCE'
        })
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(
            `The given subject, testPatient, does not reference the given practitioner, Practitioner/BAD_REFERENCE`
          );
        });
    });

    test('$evaluate returns 400 when practitioner is not referenced by any patients in Group subject, population report type', async () => {
      await supertest(server.app)
        .get('/4_0_1/Measure/testMeasure/$evaluate')
        .query({
          reportType: 'population',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          subject: 'Group/testGroup',
          practitioner: 'Practitioner/BAD_REFERENCE'
        })
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(
            `The given subject, Group/testGroup, does not reference the given practitioner, Practitioner/BAD_REFERENCE`
          );
        });
    });

    test('$evaluate returns 400 when practitioner is not referenced by any patients, population report type, no subject', async () => {
      await supertest(server.app)
        .get('/4_0_1/Measure/testMeasure/$evaluate')
        .query({
          reportType: 'population',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          practitioner: 'Practitioner/BAD_REFERENCE'
        })
        .expect(400)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('BadRequest');
          expect(response.body.issue[0].details.text).toEqual(
            `No Patient resources reference the given practitioner, Practitioner/BAD_REFERENCE`
          );
        });
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

    test('$care-gaps returns 200 with valid params and specified measureId', async () => {
      const { Calculator } = require('fqm-execution');
      const gapsSpy = jest.spyOn(Calculator, 'calculateGapsInCare').mockImplementation(() => {
        return {
          results: {
            resourceType: 'Bundle',
            type: 'document',
            entry: [
              {
                resource: testCareGapsMeasureReport
              }
            ]
          }
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

      const { body } = await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          measureId: 'testMeasure',
          subject: 'Patient/testPatient',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(200);

      expect(gapsSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021'
      });

      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter).toHaveLength(1);
      expect(body.parameter[0].name).toEqual('return');
      expect(body.parameter[0].resource).toBeDefined();
      expect(body.parameter[0].resource.resourceType).toEqual('Bundle');
    });

    test('$care-gaps returns 200 with valid params and no specified measureId', async () => {
      const { Calculator } = require('fqm-execution');
      const gapsSpy = jest.spyOn(Calculator, 'calculateGapsInCare').mockImplementation(() => {
        return {
          results: {
            resourceType: 'Bundle',
            type: 'document',
            entry: [
              {
                resource: testCareGapsMeasureReport
              }
            ]
          }
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

      const { body } = await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          subject: 'Patient/testPatient',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(200);

      expect(gapsSpy).toHaveBeenCalledTimes(3);
      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter).toHaveLength(3);
      expect(body.parameter[0].name).toEqual('return');
      expect(body.parameter[0].resource).toBeDefined();
      expect(body.parameter[0].resource.resourceType).toEqual('Bundle');
      expect(body.parameter[1].name).toEqual('return');
      expect(body.parameter[1].resource).toBeDefined();
      expect(body.parameter[1].resource.resourceType).toEqual('Bundle');
    });

    test('$care-gaps returns 200 when subject is existing group', async () => {
      const { Calculator } = require('fqm-execution');
      const gapsSpy = jest.spyOn(Calculator, 'calculateGapsInCare').mockImplementation(() => {
        return {
          results: [
            {
              resourceType: 'Bundle',
              type: 'document',
              entry: [
                {
                  resource: testCareGapsMeasureReport
                }
              ]
            },
            {
              resourceType: 'Bundle',
              type: 'document',
              entry: [
                {
                  resource: testCareGapsMeasureReport
                }
              ]
            }
          ]
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

      const { body } = await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          measureId: 'testMeasure',
          subject: 'Group/testGroup',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(200);

      expect(gapsSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021'
      });

      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter).toHaveLength(2);

      body.parameter.forEach(param => {
        expect(param.name).toEqual('return');
        expect(param.resource).toBeDefined();
        expect(param.resource.resourceType).toEqual('Bundle');
      });
    });

    test('$care-gaps returns 200 when passed a valid organization', async () => {
      const { Calculator } = require('fqm-execution');
      const gapsSpy = jest.spyOn(Calculator, 'calculateGapsInCare').mockImplementation(() => {
        return {
          results: {
            resourceType: 'Bundle',
            type: 'document',
            entry: [
              {
                resource: testCareGapsMeasureReport
              }
            ]
          }
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

      const { body } = await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          measureId: 'testMeasure',
          organization: 'Organization/testOrganization',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(200);

      expect(gapsSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021'
      });
      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter).toHaveLength(1);

      expect(body.parameter[0].name).toEqual('return');
      expect(body.parameter[0].resource).toBeDefined();
      expect(body.parameter[0].resource.resourceType).toEqual('Bundle');
    });

    test('$care-gaps fails if no organization found with referenced id', async () => {
      await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          measureId: 'testMeasure',
          organization: 'Organization/BAD_REFERENCE',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(404)
        .then(response => {
          expect(response.body.issue[0].code).toEqual('ResourceNotFound');
          expect(response.body.issue[0].details.text).toEqual(
            'No resource found in collection: Organization, with id: BAD_REFERENCE.'
          );
        });
    });

    test('$care-gaps gives length 0 response if no patients are associated with organization referenced id', async () => {
      await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          measureId: 'testMeasure',
          organization: 'Organization/testOrganization2',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(200)
        .then(response => {
          expect(response.body.resourceType).toEqual('Parameters');
          expect(response.body.parameter.length).toEqual(0);
        });
    });

    test('$care-gaps returns 200 when passed a valid practitioner', async () => {
      const { Calculator } = require('fqm-execution');
      const gapsSpy = jest.spyOn(Calculator, 'calculateGapsInCare').mockImplementation(() => {
        return {
          results: {
            resourceType: 'Bundle',
            type: 'document',
            entry: [
              {
                resource: testCareGapsMeasureReport
              }
            ]
          }
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

      const { body } = await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          measureId: 'testMeasure',
          organization: 'Organization/testOrganization',
          practitioner: 'Practitioner/testPractitioner',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(200);

      expect(gapsSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021'
      });
      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter).toHaveLength(1);

      expect(body.parameter[0].name).toEqual('return');
      expect(body.parameter[0].resource).toBeDefined();
      expect(body.parameter[0].resource.resourceType).toEqual('Bundle');
    });

    test('$care-gaps returns 200 when passed a program', async () => {
      const { Calculator } = require('fqm-execution');
      const gapsSpy = jest.spyOn(Calculator, 'calculateGapsInCare').mockImplementation(() => {
        return {
          results: {
            resourceType: 'Bundle',
            type: 'document',
            entry: [
              {
                resource: testCareGapsMeasureReport
              }
            ]
          }
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

      const { body } = await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          program: 'testProgram',
          subject: 'Patient/testPatient',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(200);

      expect(gapsSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021'
      });
      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter).toHaveLength(1);

      expect(body.parameter[0].name).toEqual('return');
      expect(body.parameter[0].resource).toBeDefined();
      expect(body.parameter[0].resource.resourceType).toEqual('Bundle');
    });

    test('$care-gaps returns 200 when passed a complicated program parameter', async () => {
      const { Calculator } = require('fqm-execution');
      const gapsSpy = jest.spyOn(Calculator, 'calculateGapsInCare').mockImplementation(() => {
        return {
          results: {
            resourceType: 'Bundle',
            type: 'document',
            entry: [
              {
                resource: testCareGapsMeasureReport
              }
            ]
          }
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

      const { body } = await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          program: ['testProgram', 'http://hl7.org/fhir/us/cqfmeasures/CodeSystem/quality-programs|testProgram2'],
          subject: 'Patient/testPatient',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(200);
      expect(gapsSpy).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
        measurementPeriodStart: '01-01-2020',
        measurementPeriodEnd: '01-01-2021'
      });
      expect(body.resourceType).toEqual('Parameters');
      expect(body.parameter).toHaveLength(1);

      expect(body.parameter[0].name).toEqual('return');
      expect(body.parameter[0].resource).toBeDefined();
      expect(body.parameter[0].resource.resourceType).toEqual('Bundle');
    });
    // TODO: create test with program query combos and make sure it's only calculated against the correct measure(s)?
    // probably need another measure fixture with a program (but still keep the one with no program and the one with 2)

    test('$care-gaps gives length 0 response if no measures are associated with program given', async () => {
      await supertest(server.app)
        .get('/4_0_1/Measure/$care-gaps')
        .query({
          program: 'testProgram-unassociated',
          subject: 'Patient/testPatient',
          periodStart: '01-01-2020',
          periodEnd: '01-01-2021',
          status: 'open-gap'
        })
        .expect(200)
        .then(response => {
          expect(response.body.resourceType).toEqual('Parameters');
          expect(response.body.parameter.length).toEqual(0);
        });
    });

    afterEach(() => {
      jest.clearAllMocks();
    });
  });
  afterAll(cleanUpTest);
});
