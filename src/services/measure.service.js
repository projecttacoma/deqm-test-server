const { ServerError, loggers } = require('@asymmetrik/node-fhir-server-core');
const { Calculator } = require('fqm-execution');
const { baseCreate, baseSearchById, baseRemove, baseUpdate, baseSearch } = require('./base.service');
const { createTransactionBundleClass } = require('../resources/transactionBundle');
const { uploadTransactionBundle } = require('./bundle.service');
const { getMeasureBundleFromId, getPatientDataBundle } = require('../util/bundleUtils');

const logger = loggers.get('default');
/**
 * resulting function of sending a POST request to {BASE_URL}/4_0_0/Measure
 * creates a new measure in the database
 * @param {*} _ unused arg
 * @param {*} data the measure data passed in with the request
 * @returns an object with the created measure's id
 */
const create = async (_, data) => {
  return baseCreate(data, 'Measure');
};

/**
 * result of sending a GET request to {BASE_URL}/4_0_0/Measure/{id}
 * searches for the measure with the passed in id
 * @param {*} args passed in arguments including the id of the sought after measure
 * @returns
 */
const searchById = async args => {
  return baseSearchById(args, 'Measure');
};

/**
 * result of sending a PUT request to {BASE_URL}/4_0_0/Measure/{id}
 * updates the measure with the passed in id using the passed in data
 * @param {*} args passed in arguments including the id of the sought after measure
 * @param {*} data a map of the attributes to change and their new values
 * @returns
 */
const update = async (args, data) => {
  return baseUpdate(args, data, 'Measure');
};

/**
 * result of sending a DELETE request to {BASE_URL}/4_0_0/Measure/{id}
 * removes the measure with the passed in id from the database
 * @param {*} args passed in arguments including the id of the sought after measure
 * @returns
 */
const remove = async args => {
  return baseRemove(args, 'Measure');
};

/**
 * Parameter definitions for attributes on Measure that we can pass to the query builder.
 */
const SEARCH_PARAM_DEFS = {
  name: { type: 'token', fhirtype: 'token', xpath: 'Measure.name' },
  version: { type: 'token', fhirtype: 'token', xpath: 'Measure.version' }
};

/**
 * result of sending a GET request to {BASE_URL}/4_0_0/Measure
 * queries for all measures matching the criteria, only name and version for now
 * @param {Object} args passed in arguments including the search parameters for the Measure
 * @param {Object} req http request object
 * @returns
 */
const search = async (args, { req }) => {
  logger.info('Measure >>> search');
  return baseSearch(args, { req }, 'Measure', SEARCH_PARAM_DEFS);
};

/**
 * takes a measureReport and a set of required data with which to calculate the measure and
 * creates new documents for the measureReport and requirements in the appropriate collections
 * @param {*} args the args object passed in by the user
 * @param {*} req the request object passed in by the user
 * @returns a transaction-response bundle
 */
const submitData = async (args, { req }) => {
  logger.info('Measure >>> $submit-data');
  if (req.body.resourceType !== 'Parameters') {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected 'resourceType: Parameters'. Received 'type: ${req.body.resourceType}'.`
          }
        }
      ]
    });
  }
  if (!req.body.parameter) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Unreadable or empty entity for attribute 'parameter'. Received: ${req.body.parameter}`
          }
        }
      ]
    });
  }
  // check if we want to do a bulk import
  if (req.headers['prefer'] === 'respond-async') {
    return await bulkImport(args, { req });
  }
  const { base_version: baseVersion } = req.params;
  const tb = createTransactionBundleClass(baseVersion);
  const parameters = req.body.parameter;
  // Ensure exactly 1 measureReport is in parameters
  const numMeasureReportsInput = parameters.filter(param => param.name === 'measureReport').length;
  if (numMeasureReportsInput !== 1) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected exactly one resource with name: 'measureReport' and/or resourceType: 'MeasureReport. Received: ${numMeasureReportsInput}`
          }
        }
      ]
    });
  }

  parameters.forEach(param => {
    //TODO: add functionality for if resource is itself a bundle

    tb.addEntryFromResource(param.resource, 'POST');
  });

  req.body = tb.toJSON();
  const output = await uploadTransactionBundle(req, req.res);
  return output;
};

/**
 * TODO: implement bulk import stuff
 * @param {*} args the args object passed in by the user
 * @param {*} req the request object passed in by the user
 */
// eslint-disable-next-line no-unused-vars
const bulkImport = async (args, { req }) => {
  logger.info('Measure >>> $bulk-import');
  const res = req.res;
  logger.info('Measure >>> $bulk-import');
  res.status(202);
  res.setHeader('Content-Location', 'EXAMPLE-LOCATION');
  //Temporary solution. Asymmetrik automatically rewrites this to a 200.
  //Rewriting the res.status method prevents the code from being overwritten.
  //TODO: change this once we fork asymmetrik
  res.status = () => res;
};

/**
 * Get all data requirements for a given measure as a FHIR Library
 * @param {Object} args the args object passed in by the user, includes measure id
 * @param {Object} req http request object
 * @returns FHIR Library with all data requirements
 */
const dataRequirements = async (args, { req }) => {
  logger.info('Measure >>> $data-requirements');

  const id = args.id || req.params.id;

  const measureBundle = await getMeasureBundleFromId(id);

  const { results } = await Calculator.calculateDataRequirements(measureBundle);
  return results;
};

/**
 * Execute the measure for a given Patient
 * @param {Object} args the args object passed in by the user, includes measure id
 * @param {Object} req http request object
 * @returns FHIR MeasureReport with population results
 */
const evaluateMeasure = async (args, { req }) => {
  logger.info('Measure >>> $evaluate-measure');
  const measureBundle = await getMeasureBundleFromId(args.id);
  const dataReq = await Calculator.calculateDataRequirements(measureBundle);

  const { periodStart, periodEnd, subject, reportType = 'subject' } = req.query;

  let errorMessage = null;
  if (!subject) {
    errorMessage = `Missing "subject" parameter for $evaluate-measure`;
  }

  if (reportType !== 'subject') {
    errorMessage = `reportType ${reportType} not supported`;
  }

  if (errorMessage !== null) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: errorMessage
          }
        }
      ]
    });
  }

  const patientBundle = await getPatientDataBundle(subject, dataReq.results.dataRequirement);

  const { results } = await Calculator.calculateMeasureReports(measureBundle, [patientBundle], {
    measurementPeriodStart: periodStart,
    measurementPeriodEnd: periodEnd
  });
  return results;
};

/**
 * Calculate the gaps in care for a given Patient
 * @param {Object} args the args object passed in by the user, includes measure id
 * @param {Object} req http request object
 * @returns FHIR MeasureReport with population results
 */
const careGaps = async (args, { req }) => {
  logger.info('Measure >>> $care-gaps');
  const { measureId, periodStart, periodEnd, subject } = req.query;

  if (!subject) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: 'Missing "subject" parameter for $care-gaps'
          }
        }
      ]
    });
  }

  const measureBundle = await getMeasureBundleFromId(measureId);
  const dataReq = await Calculator.calculateDataRequirements(measureBundle);

  const patientBundle = await getPatientDataBundle(subject, dataReq.results.dataRequirement);

  const { results } = await Calculator.calculateGapsInCare(measureBundle, [patientBundle], {
    measurementPeriodStart: periodStart,
    measurementPeriodEnd: periodEnd
  });
  return results;
};

module.exports = {
  create,
  searchById,
  remove,
  update,
  search,
  submitData,
  dataRequirements,
  evaluateMeasure,
  careGaps
};
