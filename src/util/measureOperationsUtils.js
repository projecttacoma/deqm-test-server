const { ServerError } = require('@asymmetrik/node-fhir-server-core');

/**
 * Checks that the parameters input to $evaluate-measure are valid. Throws a ServerError
 * for missing parameters, the use of unsupported parameters, and the use of unsuppported
 * report types.
 * @param {Object} req http request object
 */
function validateEvalMeasureParams(req) {
  const REQUIRED_PARAMS = ['periodStart', 'periodEnd', 'subject'];
  const UNSUPPORTED_PARAMS = ['measure', 'practitioner', 'lastReceivedOn'];

  const missingParams = REQUIRED_PARAMS.filter(key => !req.query[key]);
  const includedUnsupportedParams = UNSUPPORTED_PARAMS.filter(key => req.query[key]);

  // returns all required params that are missing in the http request
  if (missingParams.length > 0) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Missing required parameters: ${missingParams.join(', ')} for $evaluate-measure`
          }
        }
      ]
    });
  }
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
  }

  // returns unsupported report type that is included in the http request
  if (!['individual', 'summary', undefined].includes(req.query.reportType)) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `reportType ${req.query.reportType} not supported for $evaluate-measure`
          }
        }
      ]
    });
  }
}

module.exports = { validateEvalMeasureParams };
