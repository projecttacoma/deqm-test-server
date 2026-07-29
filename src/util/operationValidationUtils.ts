import { BadRequestError, NotImplementedError } from './errorUtils';

type QueryValue = string | fhir4.FhirResource | undefined;
type QueryObject = Record<string, QueryValue | QueryValue[]>;

const COLLECT_DATA_RECOGNIZED_PARAMS = [
  'measureUrl',
  'periodStart',
  'periodEnd',
  'subject',
  'subjectGroup',
  'reporter',
  'reporterResource',
  'location',
  'lastReceivedOn',
  'parameters',
  'manifest',
  'validateResources',
  'dataEndpoint'
];
const COLLECT_DATA_SUPPORTED_PARAMS = [
  'measureUrl',
  'periodStart',
  'periodEnd',
  'subject',
  'subjectGroup',
  'dataEndpoint'
];
const COLLECT_DATA_REQUIRED_PARAMS = ['measureUrl', 'periodStart', 'periodEnd'];
const COLLECT_DATA_SINGLE_CARDINALITY_PARAMS = ['periodStart', 'periodEnd', 'subject', 'subjectGroup', 'dataEndpoint'];

function paramPresent(parameters: QueryObject, param: string) {
  const value = parameters[param];
  return value !== undefined && value !== null && value !== '';
}

/**
 * Checks that the parameters input to $evaluate are valid. Throws an error
 * for missing parameters, the use of unsupported parameters, and the use of unsupported
 * report types.
 * @param {Object} query query from http request object
 * @param {string} expectedId an id passed from the url arguments
 */
export function validateEvalMeasureParams(query: QueryObject) {
  const REQUIRED_PARAMS = ['periodStart', 'periodEnd', 'measureUrl'];
  const UNSUPPORTED_PARAMS = [
    'reporterResource',
    'location',
    'parameters',
    'manifest',
    'lastReceivedOn',
    'excludeEvaluatedResources',
    'stratifier',
    'supplementalData'
  ];

  // if there is not a url argument id, then there must be measure identifying information (measureId is supported)
  checkRequiredParams(query, REQUIRED_PARAMS, '$evaluate');
  checkNoUnsupportedParams(query, UNSUPPORTED_PARAMS, '$evaluate');

  if (query.reportType === 'subject-list') {
    throw new NotImplementedError(`The subject-list reportType is not currently supported by the server.`);
  }

  // returns unsupported report type that is included in the http request
  if (
    !['subject', 'population', 'subject-list', 'individual', 'summary', undefined].includes(query.reportType as string)
  ) {
    throw new BadRequestError(`reportType ${query.reportType} is not supported for $evaluate`);
  }

  validateSubject(query);

  if (query.reporter && typeof query.reporter === 'string') {
    const practitionerReference = query.reporter.split('/');
    if (practitionerReference[0] === 'PractitionerRole' || practitionerReference[0] === 'Organization') {
      throw new NotImplementedError(`reporter as a PractitionerRole or Organization reference is not yet implemented.`);
    } else if (practitionerReference.length !== 2 || practitionerReference[0] !== 'Practitioner') {
      throw new BadRequestError(
        `reporter may only be a Practitioner resource reference of format "Practitioner/{id}".`
      );
    }
  }
}

/**
 * Checks that all required parameters for care-gaps are present. Throws an error if not.
 * @param {Object} query query from the request passed in by the client
 * @returns void but throws a detailed error if it finds an issue
 */
export function validateCareGapsParams(query: QueryObject) {
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
  } else if (query.organization && typeof query.organization === 'string') {
    if (query.subject && typeof query.subject === 'string') {
      // Cannot provide both a subject and organization
      throw new BadRequestError('Must provide either subject or organization. Received both');
    } else if (query.practitioner && typeof query.practitioner === 'string') {
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
  } else if (query.subject && typeof query.subject === 'string') {
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
}

/**
 * Checks that the parameters input to $collect-data are valid. Throws an error
 * for missing parameters, repeated single-cardinality parameters, unrecognized
 * parameters, unsupported parameters, and invalid subject inputs.
 * @param {Object} query query from http request object
 */
export function validateCollectDataParams(query: QueryObject) {
  const unrecognizedParams = Object.keys(query).filter(param => !COLLECT_DATA_RECOGNIZED_PARAMS.includes(param));
  if (unrecognizedParams.length > 0) {
    throw new BadRequestError(
      `The following parameters are unrecognized by the server: ${unrecognizedParams.join(', ')}.`
    );
  }

  const missingRequiredParams = COLLECT_DATA_REQUIRED_PARAMS.filter(param => !paramPresent(query, param));
  if (missingRequiredParams.length > 0) {
    if (missingRequiredParams.length === 1 && missingRequiredParams[0] === 'measureUrl') {
      throw new BadRequestError('At least one measureUrl is required.');
    }
    throw new BadRequestError(
      `The following required parameters are missing for $collect-data: ${missingRequiredParams.join(', ')}.`
    );
  }

  const repeatedSingleCardinalityParams = COLLECT_DATA_SINGLE_CARDINALITY_PARAMS.filter(param =>
    Array.isArray(query[param])
  );
  if (repeatedSingleCardinalityParams.length > 0) {
    throw new BadRequestError(
      `The following parameters can only be provided once for $collect-data: ${repeatedSingleCardinalityParams.join(
        ', '
      )}.`
    );
  }

  const unsupportedParams = Object.keys(query).filter(param => !COLLECT_DATA_SUPPORTED_PARAMS.includes(param));
  if (unsupportedParams.length > 0) {
    throw new NotImplementedError(
      `The following parameters are not yet supported by the server: ${unsupportedParams.join(', ')}.`
    );
  }

  validateSubject(query);

  if (!paramPresent(query, 'dataEndpoint')) {
    throw new NotImplementedError(`Currently implemented workflow requires passing a "dataEndpoint" parameter.`);
  }
}

/**
 * Checks that and subject and subjectGroup parameters are valid (same validation for evaluate and collect-data).
 * Throws an error for invalid subject inputs.
 * @param {Object} query query from http request object
 */
export function validateSubject(query: QueryObject) {
  const hasSubject = paramPresent(query, 'subject');
  const hasSubjectGroup = paramPresent(query, 'subjectGroup');
  if (hasSubject && hasSubjectGroup) {
    throw new BadRequestError('Only one of subject or subjectGroup may be specified.');
  }

  if (hasSubjectGroup) {
    const subjectGroup = query.subjectGroup;
    if (
      !subjectGroup ||
      Array.isArray(subjectGroup) ||
      typeof subjectGroup === 'string' ||
      subjectGroup.resourceType !== 'Group'
    ) {
      throw new BadRequestError('Parameter subjectGroup must be a resource of type Group.');
    }
  }

  const subject = query.subject;
  if (hasSubject && (typeof subject !== 'string' || !/^(Patient|Group)\/[\w.-]+$/.test(subject))) {
    throw new BadRequestError(
      'The subject parameter must be a Patient or Group reference of the format "Patient/{id}" or "Group/{id}".'
    );
  }
}

/**
 * Dynamic function for checking the presence of required params for all validation functions
 * @param {Object} query the query passed in through the client's request
 * @param {Array} requiredParams  an array of strings detailing which params are required
 * @param {string} operationName name of FHIR operation being checked, used for error message
 * @returns void, but throws a detailed error when necessary
 */
export function checkRequiredParams(query: Record<string, unknown>, requiredParams: string[], operationName: string) {
  // Returns a list of all required params which are undefined on req.query
  const missingParams = requiredParams.filter(key => !query[key]);
  if (missingParams.length > 0) {
    throw new BadRequestError(`Missing required parameters for ${operationName}: ${missingParams.join(', ')}.`);
  }
}

/**
 * Dynamic function for checking presence of unsupported params for the given function
 * @param {Object} query the query passed in through the client's request
 * @param {Array} unsupportedParams an array of strings for params currently unsupported by the server
 * @param {string} operationName name of FHIR operation being checked, used for error message
 */
export function checkNoUnsupportedParams(
  query: Record<string, unknown>,
  unsupportedParams: string[],
  operationName: string
) {
  const includedUnsupportedParams = unsupportedParams.filter(key => query[key]);
  // returns all unsupported params that are included in the http request
  if (includedUnsupportedParams.length > 0) {
    throw new NotImplementedError(
      `The following parameters were included and are not supported for ${operationName}: ${includedUnsupportedParams.join(
        ', '
      )}`
    );
  }
}

/**
 * Pulls query parameters from both the url query and request body and creates a new parameters map
 * @param {Object} query the query terms on the request URL
 * @param {Object} body http request body
 * @returns {Object} an object containing a combination of request parameters from both sources
 */
export function gatherParams(query: Record<string, string>, body: fhir4.Parameters): QueryObject {
  const params: QueryObject = { ...query };

  if (body.parameter) {
    body.parameter.reduce((acc, e) => {
      const value =
        e.valueDate ||
        e.valueString ||
        e.valueId ||
        e.valueCode ||
        e.valueReference?.reference ||
        e.valueCanonical ||
        e.resource;
      if (acc[e.name] !== undefined) {
        // add to existing parameter values
        if (Array.isArray(acc[e.name])) {
          (acc[e.name] as QueryValue[]).push(value);
        } else {
          acc[e.name] = [acc[e.name] as QueryValue, value];
        }
      } else {
        acc[e.name] = value;
      }
      return acc;
    }, params);
  }
  return params;
}

/**
 * Checks that $submit-data request body contains
 * a Parameters resource and the appropriate parameters.
 * @param {Object} body HTTP request body
 */
export function checkSubmitDataBody(body: fhir4.FhirResource) {
  if (body.resourceType !== 'Parameters') {
    throw new BadRequestError(`Expected 'resourceType: Parameters'. Received 'type: ${body.resourceType}'.`);
  }
  if (!body.parameter) {
    throw new BadRequestError(`Unreadable or empty entity for attribute 'parameter'. Received: ${body.parameter}`);
  }
  const parameters = body.parameter;
  const bundleParams = parameters.filter(param => param.name === 'bundle' && param.resource?.resourceType === 'Bundle');

  if (bundleParams.length !== parameters.length) {
    throw new BadRequestError(
      `Unexpected parameter included in request. All parameters for the $submit-data operation must be named bundle with type Bundle.`
    );
  }
  if (bundleParams.length < 1) {
    throw new BadRequestError(`Expected 1..* bundles. Received: ${bundleParams.length}`);
  }
}
