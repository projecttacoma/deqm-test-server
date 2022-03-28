const { retrieveProfiles, getValidationInfo } = require('../../src/util/resourceValidationUtils');

describe('resourceValidationInfo tests', () => {
  test('retrieveProfiles returns Calculation on dollar-sign operation', () => {
    const profile = retrieveProfiles('/4_0_1/Measure/$dataRequirements', {});
    expect(profile).toEqual('Calculation');
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
    const axios = require('axios');
    jest.spyOn(axios, 'post').mockImplementationOnce(() => {
      return {
        data: {
          resourceType: 'OperationOutcome',
          issue: [
            {
              details: {
                text: 'All OK'
              }
            }
          ]
        }
      };
    });
    const outcome = await getValidationInfo(['TestProfile'], {});
    expect(outcome).toEqual({ isValid: true });
  });
  test('getValidationInfo returns correct object on invalid FHIR response', async () => {
    const axios = require('axios');
    const validationReturn = {
      data: {
        resourceType: 'OperationOutcome',
        issue: [
          {
            details: {
              text: 'error'
            }
          }
        ]
      }
    };
    jest.spyOn(axios, 'post').mockImplementationOnce(() => {
      return validationReturn;
    });
    const outcome = await getValidationInfo(['TestProfile'], {});
    expect(outcome).toEqual({ isValid: false, code: 400, data: validationReturn.data });
  });
});
