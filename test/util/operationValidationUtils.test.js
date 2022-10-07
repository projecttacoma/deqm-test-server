const {
  checkRequiredParams,
  validateEvalMeasureParams,
  validateCareGapsParams,
  gatherParams
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
  test('error thrown for unsupported $evaluate-measure params', () => {
    const UNSUPPORTEDREQ = {
      query: { lastReceivedOn: '2019-01-01', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(UNSUPPORTEDREQ.query);
      expect.fail('validateEvalMeasureParams failed to throw error for unsupported params');
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(
        `The following parameters were included and are not supported for $evaluate-measure: lastReceivedOn`
      );
    }
  });

  test('error thrown for unsupported $evaluate-measure reportType', () => {
    const UNSUPPORTEDREQ = {
      query: { reportType: 'subject-list', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(UNSUPPORTEDREQ.query);
      expect.fail('validateEvalMeasureParams failed to throw error for unsupported reportType');
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(`The subject-list reportType is not currently supported by the server.`);
    }
  });

  test('error thrown for invalid $evaluate-measure reportType', () => {
    const INVALIDREQ = {
      query: { reportType: 'invalid', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(INVALIDREQ.query);
      expect.fail('validateEvalMeasureParams failed to throw error for invalid reportType');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(`reportType invalid is not supported for $evaluate-measure`);
    }
  });

  test('error thrown for missing subject for $evaluate-measure', () => {
    const MISSING_SUBJECT_REQ = {
      query: { reportType: 'subject', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(MISSING_SUBJECT_REQ.query);
      expect.fail('validateEvalMeasureParams failed to throw error for missing subject param');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `Must specify subject for all $evaluate-measure requests with reportType parameter: subject`
      );
    }
  });

  test('error thrown for population $evaluate-measure with non-Group subject', () => {
    const POPULATION_REQ = {
      query: {
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

  test('error thrown for subject $evaluate-measure with non-Patient reference subject', () => {
    const INDIVIDUAL_REQ = {
      query: {
        reportType: 'subject',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: 'Group/testGroup'
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
        `For reportType parameter 'subject', subject reference may only be a Patient resource of format "Patient/{id}".`
      );
    }
  });

  test('should throw error for invalid Practitioner reference', () => {
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
      expect(e.issue[0].details.text).toEqual(
        'practitioner may only be a Practitioner resource of format "Practitioner/{id}".'
      );
    }
  });

  test('validateEvalMeasureParams does not throw error with correct params', () => {
    const VALID_REQ = { query: { reportType: 'population', periodStart: '2019-01-01', periodEnd: '2019-12-31' } };
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

  afterAll(async () => await queue.close());
});
