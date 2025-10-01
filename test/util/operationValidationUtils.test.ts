//@ts-nocheck
const {
  checkRequiredParams,
  validateEvalMeasureParams,
  validateCareGapsParams,
  gatherParams,
  checkSubmitDataBody
} = require('../../src/util/operationValidationUtils');
const queue = require('../../src/queue/importQueue');

const VALID_SUBJECT_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  subject: 'Patient/testPatient',
  measureId: 'testID'
};

const VALID_ORGANIZATION_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  organization: 'Organization/testOrganization',
  measureId: 'testID'
};

const INVALID_ORGANIZATION_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  organization: 'INVALID',
  measureId: 'testID'
};

const SUBJECT_AND_ORGANIZATION_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  organization: 'Organization/testOrganization',
  subject: 'Patient/testPatient',
  measureId: 'testID'
};
const SUBJECT_AND_PRACTITIONER_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  practitioner: 'Practitioner/testPractitioner',
  subject: 'Patient/testPatient',
  measureId: 'testID'
};
const PRACTITIONER_AND_NO_ORG = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  practitioner: 'Practitioner/testPractitioner',
  measureId: 'testID'
};
const VALID_PRACTITIONER_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  organization: 'Organization/testOrganization',
  practitioner: 'Practitioner/testPractitioner',
  measureId: 'testID'
};
const INVALID_PRACTITIONER_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  organization: 'Organization/testOrganization',
  practitioner: 'INVALID',
  measureId: 'testID'
};

const PROGRAM_AND_MEASURE_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  subject: 'Patient/testPatient',
  measureId: 'testID',
  program: 'testProgram'
};

const VALID_PROGRAM_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  subject: 'Patient/testPatient',
  program: 'testProgram'
};

describe('checkRequiredParams', () => {
  test('check checkRequiredParams throws error on missing params', () => {
    const req = { query: {} };
    const REQUIRED_PARAMS = ['test', 'test2'];
    try {
      checkRequiredParams(req.query, REQUIRED_PARAMS, 'test');
      expect.fail('checkRequiredParams failed to throw error on missing params');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(`Missing required parameters for test: test, test2.`);
    }
  });

  test('check checkRequiredParams succeeds on valid params', () => {
    const req = { query: { test: true, test2: true } };
    const REQUIRED_PARAMS = ['test', 'test2'];
    checkRequiredParams(req.query, REQUIRED_PARAMS, 'test');
  });
});

describe('validateEvalMeasureParams', () => {
  test('error thrown for unsupported $evaluate params', () => {
    const UNSUPPORTEDREQ = {
      query: { measureId: 'testId', lastReceivedOn: '2019-01-01', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(UNSUPPORTEDREQ.query);
      expect.fail('validateEvalMeasureParams failed to throw error for unsupported params');
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(
        `The following parameters were included and are not supported for $evaluate: lastReceivedOn`
      );
    }
  });

  test('error thrown for unsupported $evaluate reportType', () => {
    const UNSUPPORTEDREQ = {
      query: { measureId: 'testId', reportType: 'subject-list', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(UNSUPPORTEDREQ.query);
      expect.fail('validateEvalMeasureParams failed to throw error for unsupported reportType');
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(`The subject-list reportType is not currently supported by the server.`);
    }
  });

  test('error thrown for invalid $evaluate reportType', () => {
    const INVALIDREQ = {
      query: { measureId: 'testId', reportType: 'invalid', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(INVALIDREQ.query);
      expect.fail('validateEvalMeasureParams failed to throw error for invalid reportType');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(`reportType invalid is not supported for $evaluate`);
    }
  });

  test('error thrown for missing subject for $evaluate', () => {
    const MISSING_SUBJECT_REQ = {
      query: { measureId: 'testId', reportType: 'subject', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(MISSING_SUBJECT_REQ.query);
      expect.fail('validateEvalMeasureParams failed to throw error for missing subject param');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `Must specify subject or subjectGroup for all $evaluate requests with reportType parameter: subject`
      );
    }
  });

  test('error thrown for population $evaluate with non-Group subject', () => {
    const POPULATION_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'population',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: 'Patient/testPatient'
      }
    };
    try {
      validateEvalMeasureParams(POPULATION_REQ.query);
      expect.fail('validateEvalMeasureParams failed to throw error for population report with non-Group subject');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `For reportType parameter 'population', subject may only be a Group resource of format "Group/{id}".`
      );
    }
  });

  test('error thrown for population $evaluate with subjectGroup and subject parameter set', () => {
    expect.assertions(2);
    const POPULATION_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'population',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: 'Group/testGroup',
        subjectGroup: {
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
                reference: 'Patient/testPatient2'
              }
            }
          ]
        }
      }
    };
    try {
      validateEvalMeasureParams(POPULATION_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(`"subject" parameter must not be included when "subjectGroup" is used.`);
    }
  });

  test('error thrown for population $evaluate with subjectGroup used for reportType subject', () => {
    expect.assertions(2);
    const POPULATION_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'subject',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subjectGroup: {
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
                reference: 'Patient/testPatient2'
              }
            }
          ]
        }
      }
    };
    try {
      validateEvalMeasureParams(POPULATION_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(
        `"subjectGroup" parameter is not currently supported for "reportType" parameter with value subject.`
      );
    }
  });

  test('error thrown for population $evaluate with Group reference used for reportType subject', () => {
    expect.assertions(2);
    const POPULATION_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'subject',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: 'Group/testGroup'
      }
    };
    try {
      validateEvalMeasureParams(POPULATION_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(
        `"subject" parameter referencing a Group is not currently supported for "reportType" parameter with value subject.`
      );
    }
  });

  test('error thrown for population $evaluate with subjectGroup without valid Patient reference members', () => {
    expect.assertions(2);
    const POPULATION_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'population',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subjectGroup: {
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
        }
      }
    };
    try {
      validateEvalMeasureParams(POPULATION_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        '\'subjectGroup\' members may only be Patient resource references of format "Patient/{id}".'
      );
    }
  });

  test('error thrown for population $evaluate with subjectGroup with members missing references', () => {
    expect.assertions(2);
    const POPULATION_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'population',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subjectGroup: {
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
        }
      }
    };
    try {
      validateEvalMeasureParams(POPULATION_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual("'subjectGroup' members must have references to Patients.");
    }
  });

  test('error thrown for population $evaluate with subjectGroup without members list', () => {
    expect.assertions(2);
    const POPULATION_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'population',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subjectGroup: {
          resourceType: 'Group',
          id: 'testGroup',
          type: 'person',
          actual: 'true'
        }
      }
    };
    try {
      validateEvalMeasureParams(POPULATION_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual("'subjectGroup' must contain members.");
    }
  });

  test('error thrown for population $evaluate with subjectGroup not a Group resource', () => {
    expect.assertions(2);
    const POPULATION_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'population',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subjectGroup: {
          resourceType: 'Measure',
          id: 'testMeasure'
        }
      }
    };
    try {
      validateEvalMeasureParams(POPULATION_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual("'subjectGroup' must be an embedded Group resource.");
    }
  });

  test('no error thrown for population $evaluate with valid subjectGroup', () => {
    const POPULATION_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'population',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subjectGroup: {
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
                reference: 'Patient/testPatient2'
              }
            }
          ]
        }
      }
    };
    expect(() => {
      validateEvalMeasureParams(POPULATION_REQ.query);
    }).not.toThrow();
  });

  test('error thrown for subject $evaluate with non-Patient reference subject', () => {
    const INDIVIDUAL_REQ = {
      query: {
        measureId: 'testId',
        reportType: 'subject',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: 'Measure/testGroup'
      }
    };
    try {
      validateEvalMeasureParams(INDIVIDUAL_REQ.query);
      expect.fail(
        'validateEvalMeasureParams failed to throw error for subject report type parameter with non-Patient subject'
      );
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `For reportType parameter 'subject', subject reference may only be a Patient or Group resource of format "Patient/{id}" or "Group/{id}".`
      );
    }
  });

  test('should throw error for invalid Practitioner reference', () => {
    try {
      validateEvalMeasureParams({
        measureId: 'testId',
        reportType: 'subject',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: 'Patient/testPatient',
        practitioner: 'INVALID'
      });
      expect.fail('validateEvalMeasureParams failed to throw error for invalid Practitioner reference');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        'practitioner may only be a Practitioner resource of format "Practitioner/{id}".'
      );
    }
  });

  test('should throw error for no measure id or expected id', () => {
    try {
      validateEvalMeasureParams({
        reportType: 'subject',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: 'Patient/testPatient',
        practitioner: 'INVALID'
      });
      expect.fail('validateEvalMeasureParams failed to throw error for invalid Practitioner reference');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('Missing required parameters for $evaluate: measureId.');
    }
  });

  test('should throw error for measure id and expected id mismatch', () => {
    try {
      validateEvalMeasureParams(
        {
          measureId: 'testId',
          reportType: 'subject',
          periodStart: '2019-01-01',
          periodEnd: '2019-12-31',
          subject: 'Patient/testPatient',
          practitioner: 'INVALID'
        },
        'mismatchId'
      );
      expect.fail('validateEvalMeasureParams failed to throw error for invalid Practitioner reference');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('URL argument id mismatchId must match parameter id testId');
    }
  });

  test('validateEvalMeasureParams does not throw error with correct params', () => {
    const VALID_REQ = {
      query: { measureId: 'testId', reportType: 'population', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    expect(validateEvalMeasureParams(VALID_REQ.query)).toBeUndefined();
  });
});

describe('validateCareGapsParams', () => {
  test('error thrown for unsupported param for $care-gaps', () => {
    const UNSUPPORTEDREQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        status: 'open-gap',
        subject: 'Patient/testPatient',
        topic: 'testTopic'
      }
    };
    try {
      validateCareGapsParams(UNSUPPORTEDREQ.query);
      expect.fail('validateCareGapsParams failed to throw error for unsupported param for $care-gaps');
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(
        `The following parameters were included and are not supported for $care-gaps: topic`
      );
    }
  });

  test('error thrown for missing open-gap status for $care-gaps', () => {
    const UNSUPPORTED_STATUS_REQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        status: 'invalid',
        subject: 'Patient/testPatient',
        measureId: 'testID'
      }
    };
    try {
      validateCareGapsParams(UNSUPPORTED_STATUS_REQ.query);
      expect.fail('validateCareGapsParams failed to throw error for missing open-gap status');
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(`Currently only supporting $care-gaps requests with status='open-gap'`);
    }
  });

  test('error thrown for invalid subject resource format', () => {
    const INVALID_SUBJECT_REQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: '123',
        status: 'open-gap',
        measureId: 'testID'
      }
    };
    try {
      validateCareGapsParams(INVALID_SUBJECT_REQ.query);
      expect.fail('validateCareGapsParams failed to throw error for unsupported param for $care-gaps');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        'Subject may only be a Group resource of format "Group/{id}" or Patient resource of format "Patient/{id}".'
      );
    }
  });

  test('error thrown for invalid subject resource type', () => {
    const INVALID_RESOURCE_TYPE_REQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: 'Observation/123',
        status: 'open-gap',
        measureId: 'testID'
      }
    };

    try {
      validateCareGapsParams(INVALID_RESOURCE_TYPE_REQ.query);
      expect.fail('validateCareGapsParams failed to throw error for invalid subject');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        'Subject may only be a Group resource of format "Group/{id}" or Patient resource of format "Patient/{id}".'
      );
    }
  });

  test('validateCareGapsParams does not throw error with correct params and defined subject', () => {
    const VALID_REQ = {
      query: VALID_SUBJECT_QUERY
    };
    expect(validateCareGapsParams(VALID_REQ.query)).toBeUndefined();
  });

  test('validateCareGapsParams does not throw error with organization instead of subject', () => {
    const VALID_REQ = {
      query: VALID_ORGANIZATION_QUERY
    };
    expect(validateCareGapsParams(VALID_REQ.query)).toBeUndefined();
  });

  test('validateCareGapsParams does not throw error with correct params and defined program', () => {
    const VALID_REQ = {
      query: VALID_PROGRAM_QUERY
    };
    expect(validateCareGapsParams(VALID_REQ.query)).toBeUndefined();
  });

  test('validateCareGapsParams throws error with invalid organization format', () => {
    const INVALID_REQ = {
      query: INVALID_ORGANIZATION_QUERY
    };
    try {
      expect(validateCareGapsParams(INVALID_REQ.query)).toBeUndefined();
      expect.fail('validateCareGapsParams failed to throw error for invalid organization format');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        'Organization may only be an Organization resource of format "Organization/{id}". Received: INVALID'
      );
    }
  });

  test('validateCareGapsParams throws error with both organization and subject', () => {
    const INVALID_REQ = {
      query: SUBJECT_AND_ORGANIZATION_QUERY
    };
    try {
      validateCareGapsParams(INVALID_REQ.query);
      expect.fail('validateCareGapsParams failed to throw an error when provided both subject and organization');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('Must provide either subject or organization. Received both');
    }
  });

  test('validateCareGapsParams does not throw error with practitioner and organization instead of subject', () => {
    expect(validateCareGapsParams(VALID_PRACTITIONER_QUERY)).toBeUndefined();
  });
  test('validateCareGapsParams throws error with both practitioner and subject', () => {
    try {
      validateCareGapsParams(SUBJECT_AND_PRACTITIONER_QUERY);
      expect.fail('validateCareGapsParams failed to throw an error when provided both subject and practitioner');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('Cannot provide both a subject and practitioner');
    }
  });
  test('validateCareGapsParams throws error with a practitioner but no organization', () => {
    try {
      validateCareGapsParams(PRACTITIONER_AND_NO_ORG);
      expect.fail(
        'validateCareGapsParams failed to throw an error when provided a practitioner without an organization'
      );
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('$care-gaps requests must identify either a subject or an organization.');
    }
  });
  test('validateCareGapsParams throws error with invalid practitioner format', () => {
    try {
      validateCareGapsParams(INVALID_PRACTITIONER_QUERY);
      expect.fail(
        'validateCareGapsParams failed to throw an error when provided a practitioner with invalid formatting'
      );
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        'Practitioner may only be a Practitioner resource of format "Practitioner/{id}". Received: INVALID'
      );
    }
  });

  test('validateCareGapsParams does not throw an error with both program and measure identification', () => {
    const VALID_REQ = {
      query: PROGRAM_AND_MEASURE_QUERY
    };
    expect(validateCareGapsParams(VALID_REQ.query)).toBeUndefined();
  });

  test('gatherParams gathers params from query and body', () => {
    const SPLIT_REQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        status: 'open-gap'
      },
      body: {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          },
          {
            name: 'measureId',
            valueId: 'testID'
          }
        ]
      }
    };
    expect(gatherParams(SPLIT_REQ.query, SPLIT_REQ.body)).toEqual(VALID_SUBJECT_QUERY);
  });

  test('gatherParams gather a repeated parameter', () => {
    const SPLIT_REQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        status: 'open-gap'
      },
      body: {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: 'Patient/testPatient'
          },
          {
            name: 'measureId',
            valueId: 'testID'
          },
          {
            name: 'measureId',
            valueId: 'testID2'
          }
        ]
      }
    };
    const doubleMeasureQuery = { ...VALID_SUBJECT_QUERY };
    doubleMeasureQuery.measureId = ['testID', 'testID2'];
    expect(gatherParams(SPLIT_REQ.query, SPLIT_REQ.body)).toEqual(doubleMeasureQuery);
  });

  afterAll(async () => await queue.close());
});

describe('checkSubmitDataBody', () => {
  test('throws error for non-Parameters resourceType in body', () => {
    const INVALID_RESOURCE_TYPE_BODY = { resourceType: 'Encounter', parameter: [] };
    try {
      checkSubmitDataBody(INVALID_RESOURCE_TYPE_BODY);
      expect.fail('checkSubmitDataBody failed to throw an error when provided non-Parameters resourceType');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(`Expected 'resourceType: Parameters'. Received 'type: Encounter'.`);
    }
  });

  test('throws error for missing parameter attribute', () => {
    const MISSING_PARAMETER_BODY = { resourceType: 'Parameters' };
    try {
      checkSubmitDataBody(MISSING_PARAMETER_BODY);
      expect.fail('checkSubmitDataBody failed to throw an error when provided body with missing parameter attribute');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `Unreadable or empty entity for attribute 'parameter'. Received: undefined`
      );
    }
  });

  test('throws error for incorrect number of measure reports in body', () => {
    const MULTIPLE_MR_BODY = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'measureReport',
          resource: {
            resourceType: 'MeasureReport'
          }
        },
        {
          name: 'measureReport2',
          resource: {
            resourceType: 'MeasureReport'
          }
        }
      ]
    };
    try {
      checkSubmitDataBody(MULTIPLE_MR_BODY);
      expect.fail('checkSubmitDataBody failed to throw an error when provided multiple MeasureReports');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `Unexpected parameter included in request. All parameters for the $submit-data operation must be named bundle with type Bundle.`
      );
    }
  });
});
