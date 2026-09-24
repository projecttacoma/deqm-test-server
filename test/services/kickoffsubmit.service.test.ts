//@ts-nocheck
import axios from 'axios';
const supertest = require('supertest');
import { findResourceById } from '../../src/database/dbOperations';
import { buildConfig } from '../../src/config/profileConfig';
import { initialize } from '../../src/server/server';
const { cleanUpTest } = require('../populateTestData');

jest.mock('axios');
jest.mock('../../src/database/dbOperations', () => ({
  findResourceById: jest.fn()
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFindResourceById = findResourceById as jest.MockedFunction<typeof findResourceById>;
const fhirClientAxios = { request: jest.fn() };
axios.create.mockReturnValue(fhirClientAxios);

const report = {
  resourceType: 'MeasureReport',
  id: 'report-1',
  reporter: { reference: 'Organization/reporter-1' },
  evaluatedResource: [{ reference: 'Patient/patient-1' }, { reference: 'Observation/observation-1' }]
};

const request = {
  resourceType: 'Parameters',
  parameter: [
    { name: 'report', resource: report },
    {
      name: 'receiverEndpoint',
      resource: { resourceType: 'Endpoint', address: 'https://receiver.example.org/fhir' }
    }
  ]
};

let server;
describe('kickoffSubmit', () => {
  beforeAll(async () => {
    const config = buildConfig();
    server = initialize(config);
  });
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('submits the report, evaluated resources, and reporter to $submit-data', async () => {
    mockedFindResourceById.mockImplementation(async (id, resourceType) => ({ resourceType, id }));
    fhirClientAxios.request.mockResolvedValue({
      data: { resourceType: 'Bundle', type: 'transaction-response' }
    });

    await supertest(server.app)
      .post('/4_0_1/kickoff-submit')
      .send(request)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(200)
      .then(response => {
        expect(response.body).toEqual({
          resourceType: 'Bundle',
          type: 'transaction-response'
        });
        expect(mockedFindResourceById).toHaveBeenCalledWith('patient-1', 'Patient');
        expect(mockedFindResourceById).toHaveBeenCalledWith('observation-1', 'Observation');
        expect(mockedFindResourceById).toHaveBeenCalledWith('reporter-1', 'Organization');
        expect(mockedAxios.create).toHaveBeenCalledWith({
          baseURL: 'https://receiver.example.org/fhir',
          headers: { Accept: 'application/fhir+json' }
        });
        expect(fhirClientAxios.request).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'POST',
            url: 'https://receiver.example.org/fhir/Measure/$submit-data',
            headers: { Accept: 'application/fhir+json', 'Content-Type': 'application/fhir+json' },
            data: {
              resourceType: 'Parameters',
              parameter: [
                {
                  name: 'bundle',
                  resource: {
                    resourceType: 'Bundle',
                    id: expect.any(String),
                    type: 'transaction',
                    entry: [
                      {
                        resource: {
                          ...report,
                          extension: [
                            {
                              url: 'http://hl7.org/fhir/us/davinci-deqm/StructureDefinition/extension-submitDataUpdateType',
                              valueCode: 'snapshot'
                            }
                          ],
                          meta: {
                            profile: [
                              'http://hl7.org/fhir/us/davinci-deqm/StructureDefinition/datax-measurereport-deqm'
                            ]
                          }
                        },
                        request: { method: 'PUT', url: 'MeasureReport/report-1' }
                      },
                      {
                        resource: { resourceType: 'Patient', id: 'patient-1' },
                        request: { method: 'PUT', url: 'Patient/patient-1' }
                      },
                      {
                        resource: { resourceType: 'Observation', id: 'observation-1' },
                        request: { method: 'PUT', url: 'Observation/observation-1' }
                      },
                      {
                        resource: { resourceType: 'Organization', id: 'reporter-1' },
                        request: { method: 'PUT', url: 'Organization/reporter-1' }
                      }
                    ]
                  }
                }
              ]
            }
          })
        );
      });
  });

  test('rejects an evaluated resource that is not stored locally', async () => {
    mockedFindResourceById.mockResolvedValue(null);

    await supertest(server.app)
      .post('/4_0_1/kickoff-submit')
      .send(request)
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(404)
      .then(response => {
        expect(response.body.issue[0].details.text).toEqual(
          'Could not find Patient/patient-1 referenced by MeasureReport.evaluatedResource.'
        );
      });
  });

  test('requires a Parameters request body', async () => {
    await supertest(server.app)
      .post('/4_0_1/kickoff-submit')
      .send({ resourceType: 'MeasureReport' })
      .set('Accept', 'application/json+fhir')
      .set('content-type', 'application/json+fhir')
      .expect(400)
      .then(response => {
        expect(response.body.issue[0].details.text).toEqual('Request body must be a FHIR Parameters resource.');
      });
  });

  afterAll(cleanUpTest);
});
