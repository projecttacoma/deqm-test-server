const { BadRequestError, NotImplementedError } = require('./errorUtils');

/**
 * Checks that the parameters input to $evaluate are valid. Throws an error
 * for missing parameters, the use of unsupported parameters, and the use of unsupported
 * report types.
 * @param {Object} query query from http request object
 * @param {string} expectedId an id passed from the url arguments
 */
function validateEvalMeasureParams(query, expectedId) {
  const REQUIRED_PARAMS = ['periodStart', 'periodEnd'];
  // currently only supports measureId as the identifier
  const UNSUPPORTED_PARAMS = ['lastReceivedOn', 'measureIdentifier', 'measureUrl', 'measure', 'measureResource'];

  // if there is not a url argument id, then there must be measure identifying information (measureId is supported)
  checkRequiredParams(query, !expectedId ? ['measureId', ...REQUIRED_PARAMS] : REQUIRED_PARAMS, '$evaluate');
  checkNoUnsupportedParams(query, UNSUPPORTED_PARAMS, '$evaluate');

  // if both url argument id and parameter measureId exist, they must match
  if (expectedId && query.measureId && expectedId !== query.measureId) {
    throw new BadRequestError(`URL argument id ${expectedId} must match parameter id ${query.measureId}`);
  }

  if (query.reportType === 'subject-list') {
    throw new NotImplementedError(`The subject-list reportType is not currently supported by the server.`);
  }

  // returns unsupported report type that is included in the http request
  if (!['subject', 'population', 'subject-list', undefined].includes(query.reportType)) {
    throw new BadRequestError(`reportType ${query.reportType} is not supported for $evaluate`);
  }

  if (!query.subject && query.reportType === 'subject') {
    throw new BadRequestError(`Must specify subject for all $evaluate requests with reportType parameter: subject`);
  }

  if (query.reportType === 'population' && query.subject) {
    const subjectReference = query.subject.split('/');
    if (subjectReference.length !== 2 || subjectReference[0] !== 'Group') {
      throw new BadRequestError(
        `For reportType parameter 'population', subject may only be a Group resource of format "Group/{id}".`
      );
    }
  }

  if (query.reportType === 'subject') {
    const subjectReference = query.subject.split('/');
    if (subjectReference.length > 1 && subjectReference[0] !== 'Patient') {
      throw new BadRequestError(
        `For reportType parameter 'subject', subject reference may only be a Patient resource of format "Patient/{id}".`
      );
    }
  }

  if (query.practitioner) {
    const practitionerReference = query.practitioner.split('/');
    if (practitionerReference.length !== 2 || practitionerReference[0] !== 'Practitioner') {
      throw new BadRequestError(`practitioner may only be a Practitioner resource of format "Practitioner/{id}".`);
    }
  }
}

/**
 * Checks that all required parameters for care-gaps are present. Throws an error if not.
 * @param {Object} query query from the request passed in by the client
 * @returns void but throws a detailed error if it finds an issue
 */
const validateCareGapsParams = query => {
  const REQUIRED_PARAMS = ['periodStart', 'periodEnd', 'status'];
  // These params are not supported. We should throw an error if we receive them
  const UNSUPPORTED_PARAMS = ['topic'];

  checkRequiredParams(query, REQUIRED_PARAMS, '$care-gaps');
  checkNoUnsupportedParams(query, UNSUPPORTED_PARAMS, '$care-gaps');

  if (query.status !== 'open-gap') {
    throw new NotImplementedError(`Currently only supporting $care-gaps requests with status='open-gap'`);
  }

  if (!query.subject && !query.organization) {
    throw new BadRequestError(`$care-gaps requests must identify either a subject or an organization.`);
  } else if (query.organization) {
    if (query.subject) {
      // Cannot provide both a subject and organization
      throw new BadRequestError('Must provide either subject or organization. Received both');
    } else if (query.practitioner) {
      const pracReference = query.practitioner.split('/');
      if (pracReference[0] !== 'Practitioner') {
        throw new BadRequestError(
          `Practitioner may only be a Practitioner resource of format "Practitioner/{id}". Received: ${query.practitioner}`
        );
      }
    }
    const orgReference = query.organization.split('/');
    if (orgReference[0] !== 'Organization') {
      throw new BadRequestError(
        `Organization may only be an Organization resource of format "Organization/{id}". Received: ${query.organization}`
      );
    }
  } else if (query.subject) {
    if (query.practitioner) {
      throw new BadRequestError('Cannot provide both a subject and practitioner');
    }
    const subjectReference = query.subject.split('/');
    if (subjectReference.length !== 2 || !['Group', 'Patient'].includes(subjectReference[0])) {
      throw new BadRequestError(
        `Subject may only be a Group resource of format "Group/{id}" or Patient resource of format "Patient/{id}".`
      );
    }
  }

  if (
    (query.measureId && (query.measureIdentifier || query.measureUrl)) ||
    ((query.measureId || query.measureIdentifier) && query.measureUrl)
  ) {
    throw new NotImplementedError(
      'Simultaneous measure identification (measureId/measureIdentifier/measureUrl) is not currently supported by the server.'
    );
  }
};

/**
 * Dynamic function for checking the presence of required params for all validation functions
 * @param {Object} query the query passed in through the client's request
 * @param {Array} requiredParams  an array of strings detailing which params are required
 * @param {string} operationName name of FHIR operation being checked, used for error message
 * @returns void, but throws a detailed error when necessary
 */
const checkRequiredParams = (query, requiredParams, operationName) => {
  // Returns a list of all required params which are undefined on req.query
  const missingParams = requiredParams.filter(key => !query[key]);
  if (missingParams.length > 0) {
    throw new BadRequestError(`Missing required parameters for ${operationName}: ${missingParams.join(', ')}.`);
  }
};

/**
 * Dynamic function for checking presence of unsupported params for the given function
 * @param {Object} query the query passed in through the client's request
 * @param {Array} unsupportedParams an array of strings for params currently unsupported by the server
 * @param {string} operationName name of FHIR operation being checked, used for error message
 */
const checkNoUnsupportedParams = (query, unsupportedParams, operationName) => {
  const includedUnsupportedParams = unsupportedParams.filter(key => query[key]);
  // returns all unsupported params that are included in the http request
  if (includedUnsupportedParams.length > 0) {
    throw new NotImplementedError(
      `The following parameters were included and are not supported for ${operationName}: ${includedUnsupportedParams.join(
        ', '
      )}`
    );
  }
};

/**
 * Pulls query parameters from both the url query and request body and creates a new parameters map
 * @param {Object} query the query terms on the request URL
 * @param {Object} body http request body
 * @returns {Object} an object containing a combination of request parameters from both sources
 */
const gatherParams = (query, body) => {
  const params = { ...query };

  if (body.parameter) {
    body.parameter.reduce((acc, e) => {
      if (!e.resource) {
        // For now, all usable params are expected to be stored under one of these four keys
        const value = e.valueDate || e.valueString || e.valueId || e.valueCode;
        if (acc[e.name] !== undefined) {
          // add to existing parameter values
          if (Array.isArray(acc[e.name])) {
            acc[e.name].push(value);
          } else {
            acc[e.name] = [acc[e.name], value];
          }
        } else {
          acc[e.name] = value;
        }
      }
      return acc;
    }, params);
  }
  return params;
};

/**
 * Checks that $submit-data/$bulk-submit-data request body contains
 * a Parameters resource and the appropriate parameters.
 * @param {Object} body HTTP request body
 */
const checkSubmitDataBody = body => {
  if (body.resourceType !== 'Parameters') {
    throw new BadRequestError(`Expected 'resourceType: Parameters'. Received 'type: ${body.resourceType}'.`);
  }
  if (!body.parameter) {
    throw new BadRequestError(`Unreadable or empty entity for attribute 'parameter'. Received: ${body.parameter}`);
  }
  const parameters = body.parameter;
  // Ensure exactly 1 measureReport is in parameters
  const numMeasureReportsInput = parameters.filter(
    param => param.name === 'measureReport' || param.resource?.resourceType === 'MeasureReport'
  ).length;
  if (numMeasureReportsInput !== 1) {
    throw new BadRequestError(
      `Expected exactly one resource with name: 'measureReport' and/or resourceType: 'MeasureReport. Received: ${numMeasureReportsInput}`
    );
  }
};

module.exports = {
  validateEvalMeasureParams,
  validateCareGapsParams,
  checkRequiredParams,
  gatherParams,
  checkSubmitDataBody
};
