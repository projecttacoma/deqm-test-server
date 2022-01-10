const {
  checkRequiredParams,
  validateEvalMeasureParams,
  validateCareGapsParams,
  gatherParams
} = require('../../src/util/validationUtils');
const queue = require('../../src/resources/importQueue');

const VALID_QUERY = {
  periodStart: '2019-01-01',
  periodEnd: '2019-12-31',
  status: 'open',
  subject: 'testPatient',
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
        status: 'open',
        subject: 'testPatient',
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

  test('error thrown for missing measure identification for $care-gaps', async () => {
    const MISSING_MEASURE_REQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        status: 'open',
        subject: 'testPatient'
      }
    };
    try {
      validateCareGapsParams(MISSING_MEASURE_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(400);
      expect(e.issue[0].details.text).toEqual(
        `No measure identification parameter supplied. Must provide either 'measureId', 'measureUrl', or 'measureIdentifier' parameter for $care-gaps requests`
      );
    }
  });

  test('error thrown for missing open status for $care-gaps', async () => {
    const UNSUPPORTED_STATUS_REQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        status: 'invalid',
        subject: 'testPatient',
        measureId: 'testID'
      }
    };
    try {
      validateCareGapsParams(UNSUPPORTED_STATUS_REQ.query);
    } catch (e) {
      expect(e.statusCode).toEqual(501);
      expect(e.issue[0].details.text).toEqual(`Currently only supporting $care-gaps requests with status='open'`);
    }
  });

  test('validateCareGapsParams does not throw error with correct params', async () => {
    const VALID_REQ = {
      query: VALID_QUERY
    };
    expect(validateCareGapsParams(VALID_REQ.query)).toBeUndefined();
  });

  test('gatherParams gathers params from query and body', () => {
    const SPLIT_REQ = {
      query: {
        periodStart: '2019-01-01',
        periodEnd: '2019-12-31',
        status: 'open'
      },
      body: {
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'subject',
            valueString: 'testPatient'
          },
          {
            name: 'measureId',
            valueId: 'testID'
          }
        ]
      }
    };
    expect(gatherParams(SPLIT_REQ.query, SPLIT_REQ.body)).toEqual(VALID_QUERY);
  });

  afterAll(async () => await queue.close());
});
