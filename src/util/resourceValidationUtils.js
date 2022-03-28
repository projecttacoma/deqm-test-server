const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

/**
 * Checks body of request by querying a FHIR validation server. Updates the submitted resource to
 * include validated profiles in the meta.profile field. Responds with 400 if body is not valid FHIR
 * 500 if validation server error
 * @param {Object} req request object of an express request
 * @param {Object} res response object of an express request
 * @param {Function} next express function which passes info along after clearing the middleware
 */
async function validateFhir(req, res, next) {
  const profiles = retrieveProfiles(req.originalUrl, req.body);
  if (profiles !== 'Calculation') {
    //We know the profile pulled from the URL will be the last profile added to the array
    const qicoreProfile = `http://hl7.org/fhir/us/qicore/StructureDefinition/qicore-${profiles[
      profiles.length - 1
    ].toLowerCase()}`;
    console.log(profiles);
    const qicoreValidationInfo = await getValidationInfo([qicoreProfile], req.body, req.base_version);
    const validationInfo = await getValidationInfo(profiles, req.body, req.base_version);

    if (validationInfo.isValid) {
      /*
       * We don't want the qicore failure to cause the whole resource to fail validation,
       * so simply don't add it and move on if it fails
       */
      if (qicoreValidationInfo.isValid) {
        profiles.push(qicoreProfile);
      }
      if (req.body?.meta?.profile) {
        const validatedProfiles = new Set(req.body.meta.profile);
        profiles.forEach(profile => {
          validatedProfiles.add(profile);
        });
        req.body.meta.profile = Array.from(validatedProfiles);
      } else {
        req.body['meta'] = { profile: profiles };
      }

      next();
    } else {
      res.status(validationInfo.code).json(validationInfo.data);
    }
  } else {
    next();
  }
}

/**
 * Determines the profiles the submitted resource is expected to be validated against
 * @param {String} originalUrl the url the request was sent to
 * @param {Object} body an express request body containing a FHIR resource
 * @returns String or Array
 */
function retrieveProfiles(originalUrl, body) {
  const profiles = [];
  const params = originalUrl.split('/');

  const metaProfiles = body?.meta?.profile;
  if (metaProfiles) {
    profiles.push(...metaProfiles);
  }
  if (params[params.length - 1] === '$submit-data') {
    profiles.push('Parameters');
  }
  // We don't need to validate posted Parameters bodies for dollar-sign operations since these aren't stored in the db
  else if (params[params.length - 1][0] === '$') {
    return 'Calculation';
  }
  // Only param was base_version, so this is a transaction bundle upload
  else if (params.length === 2) {
    profiles.push('Bundle');
  } else if (params.length > 2) {
    /*
     * If two or more params and not dollar-sign operation, third param must be the resourceType
     * keep in mind, the first param will always be the empty string since originalUrl starts with '/'
     */
    profiles.push(params[2]);
  }
  return profiles;
}

/**
 * Queries the validation server and returns an object with the validity outcome and, upon failure,
 * information about what was invalid
 * @param {String} validationUrl the url to query for resource validation
 * @param {Object} body the body of an express request containing a FHIR resource
 * @returns Object
 */
async function getValidationInfo(profiles, body, base_version) {
  const validationUrl = `http://${process.env.VALIDATOR_HOST}:${
    process.env.VALIDATOR_PORT
  }/validate?profile=${profiles.join(',')}`;
  let response;
  try {
    response = await axios.post(validationUrl, body);
  } catch (e) {
    /*
        We can't throw server errors inside this middleware, so best to construct
        our own operation outcomes and return them
    */
    const outcome = {};
    outcome.id = uuidv4();
    outcome.issue = [
      {
        severity: 'error',
        code: 'exception',
        details: {
          text: `Validation server failed while validating against profiles: ${profiles.join(',')}`
        }
      }
    ];
    const OperationOutcome = resolveSchema(base_version, 'operationoutcome');
    return { isValid: false, code: 500, data: new OperationOutcome(outcome).toJSON() };
  }
  if (response.data.issue[0].details.text !== 'All OK') {
    return { isValid: false, code: 400, data: response.data };
  }
  return { isValid: true };
}

module.exports = { validateFhir, retrieveProfiles, getValidationInfo };
