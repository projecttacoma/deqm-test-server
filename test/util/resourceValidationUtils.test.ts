//@ts-nocheck
const {
  retrieveProfiles,
  getValidationInfo,
  isValidFhir,
  validateFhir
} = require('../../src/util/resourceValidationUtils');
const axios = require('axios');

const validationErrorResponse = {
  resourceType: 'OperationOutcome',
  issue: [
    {
      details: {
        text: 'error'
      },
      severity: 'error'
    }
  ]
};
const validationSuccessResponse = {
  resourceType: 'OperationOutcome',
  issue: [
    {
      details: {
        text: 'All OK'
      },
      severity: 'informational'
    }
  ]
};

const req = {
  originalUrl: 'http://example.com/4_0_1',
  params: { base_version: '4_0_1' },
  body: {}
};

describe('resourceValidationInfo tests', () => {
  test('validateFhir calls next() on valid FHIR', async () => {
    jest.spyOn(axios, 'post').mockImplementation(() => {
      return {
        data: validationSuccessResponse
      };
    });
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    const next = jest.fn();
    await validateFhir(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
  test('validateFhir calls res.status and res.json on invalid FHIR', async () => {
    jest.spyOn(axios, 'post').mockImplementation(() => {
      return { data: validationErrorResponse };
    });

    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    const next = jest.fn();
    await validateFhir(req, res, next);
    expect(res.status).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith(validationErrorResponse);
  });
  test('retrieveProfiles returns empty array on dollar-sign operation', () => {
    const profile = retrieveProfiles('/4_0_1/Measure/$data-requirements', {});
    expect(profile).toEqual([]);
  });
  test('retrieveProfiles returns Bundle on transaction bundle upload URL', () => {
    const profile = retrieveProfiles('/4_0_1', {});
    expect(profile).toEqual(['Bundle']);
  });
  test('retrieveProfiles returns Patient with Patient URL', () => {
    const profile = retrieveProfiles('/4_0_1/Patient', {});
    expect(profile).toEqual(['Patient'], {});
  });
  test('retrieveProfiles returns Patient and meta.profile info with Patient URL and meta.profile in body', () => {
    const profile = retrieveProfiles('/4_0_1/Patient', { meta: { profile: ['testProfile', 'testProfile2'] } });
    expect(profile).toEqual(['testProfile', 'testProfile2', 'Patient'], {});
  });
  test('getValidationInfo returns correct object on valid FHIR response', async () => {
    jest.spyOn(axios, 'post').mockImplementationOnce(() => {
      return {
        data: validationSuccessResponse
      };
    });
    const outcome = await getValidationInfo(['TestProfile'], {});
    expect(outcome).toEqual({ isValid: true });
  });
  test('getValidationInfo returns correct object on invalid FHIR response', async () => {
    const validationReturn = {
      data: validationErrorResponse
    };
    jest.spyOn(axios, 'post').mockImplementationOnce(() => {
      return validationReturn;
    });
    const outcome = await getValidationInfo(['TestProfile'], {});
    expect(outcome).toEqual({ isValid: false, code: 400, data: validationReturn.data });
  });
  test('isValidFHIR returns true on object with no errors', () => {
    const response = {
      data: validationSuccessResponse
    };
    expect(isValidFhir(response)).toBe(true);
  });

  test('isValidFHIR returns false on object with an error', () => {
    const response = {
      data: validationErrorResponse
    };
    expect(isValidFhir(response)).toBe(false);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
});
