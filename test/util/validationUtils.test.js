const {
  checkRequiredParams,
  validateEvalMeasureParams,
  validateCareGapsParams,
  gatherParams,
  checkExportType
} = require('../../src/util/validationUtils');
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

const SUBJECT_AND_ORGANIZATION_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open-gap',
  organization: 'Organization/testOrganization',
  subject: 'Patient/testPatient',
  measureId: 'testID'
};

describe('checkRequiredParams', () => {
  test('check checkRequiredParams throws error on missing params', () => {
    const req = { query: {} };
    const REQUIRED_PARAMS = ['test', 'test2'];
    try {
      checkRequiredParams(req.query, REQUIRED_PARAMS, 'test');
      throw new Error('checkRequiredParams failed to fail');
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
  test('error thrown for unsupported $evaluate-measure params', async () => {
    const UNSUPPORTEDREQ = {
      query: { practitioner: 'testPractitioner', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(UNSUPPORTEDREQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(
        `The following parameters were included and are not supported for $evaluate-measure: practitioner`
      );
    }
  });

  test('error thrown for unsupported $evaluate-measure reportType', async () => {
    const UNSUPPORTEDREQ = {
      query: { reportType: 'subject-list', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(UNSUPPORTEDREQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(`The subject-list reportType is not currently supported by the server.`);
    }
  });

  test('error thrown for invalid $evaluate-measure reportType', async () => {
    const INVALIDREQ = {
      query: { reportType: 'invalid', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(INVALIDREQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(`reportType invalid is not supported for $evaluate-measure`);
    }
  });

  test('error thrown for missing subject for $evaluate-measure', async () => {
    const MISSING_SUBJECT_REQ = {
      query: { reportType: 'individual', periodStart: '2019-01-01', periodEnd: '2019-12-31' }
    };
    try {
      validateEvalMeasureParams(MISSING_SUBJECT_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `Must specify subject for all $evaluate-measure requests with reportType: individual`
      );
    }
  });

  test('error thrown for population $evaluate-measure with non-Group subject', async () => {
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
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `For report type 'population', subject may only be a Group resource of format "Group/{id}".`
      );
    }
  });

  test('error thrown for individual $evaluate-measure with non-Patient reference subject', async () => {
    const INDIVIDUAL_REQ = {
      query: {
        reportType: 'individual',
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        subject: 'Group/testGroup'
      }
    };
    try {
      validateEvalMeasureParams(INDIVIDUAL_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `For report type 'individual', subject reference may only be a Patient resource of format "Patient/{id}".`
      );
    }
  });

  test('validateEvalMeasureParams does not throw error with correct params', async () => {
    const VALID_REQ = { query: { reportType: 'population', periodStart: '2019-01-01', periodEnd: '2019-12-31' } };
    expect(validateEvalMeasureParams(VALID_REQ.query)).toBeUndefined();
  });
});

describe('validateCareGapsParams', () => {
  test('error thrown for unsupported param for $care-gaps', async () => {
    const UNSUPPORTEDREQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        status: 'open-gap',
        subject: 'Patient/testPatient',
        practitioner: 'testPractitioner'
      }
    };
    try {
      validateCareGapsParams(UNSUPPORTEDREQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(
        `The following parameters were included and are not supported for $care-gaps: practitioner`
      );
    }
  });

  test('error thrown for missing open-gap status for $care-gaps', async () => {
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
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(`Currently only supporting $care-gaps requests with status='open-gap'`);
    }
  });

  test('error thrown for invalid subject resource format', async () => {
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
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `subject may only be a Group resource of format "Group/{id}" or Patient resource of format "Patient/{id}".`
      );
    }
  });

  test('error thrown for invalid subject resource type', async () => {
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
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `subject may only be a Group resource of format "Group/{id}" or Patient resource of format "Patient/{id}".`
      );
    }
  });

  test('validateCareGapsParams does not throw error with correct params and defined subject', async () => {
    const VALID_REQ = {
      query: VALID_SUBJECT_QUERY
    };
    expect(validateCareGapsParams(VALID_REQ.query)).toBeUndefined();
  });

  test('validateCareGapsParams does not throw error with organization instead of subject', async () => {
    const VALID_REQ = {
      query: VALID_ORGANIZATION_QUERY
    };
    expect(validateCareGapsParams(VALID_REQ.query)).toBeUndefined();
  });

  test('validateCareGapsParams does not throw error with organization instead of subject', async () => {
    const INVALID_REQ = {
      query: SUBJECT_AND_ORGANIZATION_QUERY
    };
    try {
      validateCareGapsParams(INVALID_REQ.query);
      throw new Error('validateCareGapsParams failed to throw an error when provided both subject and organization');
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual('must provide either subject or organization. Received both');
    }
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

describe('checkExportType', () => {
  test('checkExportType throws 501 error for unsupported static export type', () => {
    const STATIC_EXPORT_PARAMS = [
      { name: 'exportUrl', valueUrl: 'http://example.com' },
      { name: 'exportType', valueString: 'static' }
    ];
    try {
      checkExportType(STATIC_EXPORT_PARAMS);
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(`static exportType is not supported on this server`);
    }
  });

  test('checkExportType does not throw error for dynamic export type', () => {
    const DYNAMIC_EXPORT_PARAMS = [
      { name: 'exportUrl', valueUrl: 'http://example.com' },
      { name: 'exportType', valueString: 'dynamic' }
    ];
    expect(checkExportType(DYNAMIC_EXPORT_PARAMS)).toBeUndefined();
  });
});
