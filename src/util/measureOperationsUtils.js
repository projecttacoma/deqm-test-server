const { ServerError } = require('@projecttacoma/node-fhir-server-core');

/**
 * Checks that the parameters input to $evaluate-measure are valid. Throws a ServerError
 * for missing parameters, the use of unsupported parameters, and the use of unsuppported
 * report types.
 * @param {Object} req http request object
 */
function validateEvalMeasureParams(req) {
  const REQUIRED_PARAMS = ['periodStart', 'periodEnd'];
  const UNSUPPORTED_PARAMS = ['measure', 'practitioner', 'lastReceivedOn'];

  checkRequiredParams(req, REQUIRED_PARAMS, '$evaluate-measure');
  const includedUnsupportedParams = UNSUPPORTED_PARAMS.filter(key => req.query[key]);

  // returns all unsupported params that are included in the http request
  if (includedUnsupportedParams.length > 0) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `The following parameters were included and are not supported for $evaluate-measure: ${includedUnsupportedParams.join(
              ', '
            )}`
          }
        }
      ]
    });
  } else if (req.query.reportType === 'subject-list') {
    throw new ServerError(null, {
      statusCode: 501,
      issue: [
        {
          severity: 'error',
          code: 'NotImplemented',
          details: {
            text: `The subject-list reportType is not currently supported by the server.`
          }
        }
      ]
    });
  }

  // returns unsupported report type that is included in the http request
  if (!['individual', 'population', 'subject-list', undefined].includes(req.query.reportType)) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `reportType ${req.query.reportType} is not supported for $evaluate-measure`
          }
        }
      ]
    });
  }

  if (!req.query.subject && req.query.reportType !== 'population') {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Must specify subject for all $evaluate-measure requests with reportType: ${req.query.reportType}`
          }
        }
      ]
    });
  }
}

/**
 * Uses request body parameter to search for the export server URL. Validates that
 * only one URL is present.
 * @param {*} parameters - request body parameter
 * @returns export server URL string
 */
const retrieveExportURL = parameters => {
  const exportURLArray = parameters.filter(param => param.name === 'exportURL');

  if (exportURLArray.length === 0) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `No exportURL parameter was found.`
          }
        }
      ]
    });
  }
  if (exportURLArray.length !== 1) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected exactly one export URL. Received: ${exportURLArray.length}`
          }
        }
      ]
    });
  }
  const exportURL = exportURLArray[0].valueString;
  if (!exportURL) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected a valueString for the exportURL, but none was found`
          }
        }
      ]
    });
  }
  return exportURL;
};

/**
 * Checks that all required parameters for care-gaps are present. Throws an error if not.
 * @param {*} req the request passed in by the client
 * @returns void but throws a detailed error if it finds an issue
 */
const validateCareGapsParams = req => {
  const REQUIRED_PARAMS = ['periodStart', 'periodEnd', 'status', 'subject'];
  // These params are not supported. We should throw an error if we receive them
  const UNSUPPORTED_PARAMS = ['topic', 'practitioner', 'organization', 'program'];

  checkRequiredParams(req, REQUIRED_PARAMS, '$care-gaps');
  // Returns a list of all unsupported params which are present
  const presentUnsupportedParams = UNSUPPORTED_PARAMS.filter(key => req.query[key]);

  if (presentUnsupportedParams.length > 0) {
    throw new ServerError(null, {
      statusCode: 501,
      issue: [
        {
          severity: 'error',
          code: 'NotImplemented',
          details: {
            text: `$care-gaps functionality has not yet been implemented for requests with parameters: ${presentUnsupportedParams.join(
              ', '
            )}`
          }
        }
      ]
    });
  }

  const measureIdentification = req.query.measureId || req.query.measureIdentifier || req.query.measureUrl;

  if (!measureIdentification) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `No measure identification parameter supplied. Must provide either 'measureId', 'measureUrl', or 'measureIdentifier' parameter for $care-gaps requests`
          }
        }
      ]
    });
  }

  if (req.query.status !== 'open') {
    throw new ServerError(null, {
      statusCode: 501,
      issue: [
        {
          severity: 'error',
          code: 'NotImplemented',
          details: {
            text: `Currently only supporting $care-gaps requests with status='open'`
          }
        }
      ]
    });
  }
};

/**
 * Checks that the parameters passed in for $data-requirements are vaild
 * @param {*} req the request passed in by the user
 * @returns void but throws a detailed error if necessary
 */
const validateDataRequirementsParams = req => {
  const REQUIRED_PARAMS = ['periodStart', 'periodEnd'];
  checkRequiredParams(req, REQUIRED_PARAMS, '$data-requirements');
};

/**
 * Dynamic function for checking the presence of required params for all validation functions
 * @param {*} query the query passed in through the client's request
 * @param {*} requiredParams  an array of strings detailing which params are required
 * @param {*} functionName the name of the function we are checking for more detailed error message
 * @returns void, but throws a detailed error when necessary
 */
const checkRequiredParams = ({ query }, requiredParams, functionName) => {
  // Returns a list of all required params which are undefined on req.query
  const missingParams = requiredParams.filter(key => !query[key]);
  if (missingParams.length > 0) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Missing required parameters for ${functionName}: ${missingParams.join(', ')}.`
          }
        }
      ]
    });
  }
};

module.exports = {
  retrieveExportURL,
  validateEvalMeasureParams,
  validateCareGapsParams,
  validateDataRequirementsParams,
  checkRequiredParams
};
