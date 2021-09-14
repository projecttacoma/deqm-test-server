const { ServerError, loggers, resolveSchema } = require('@asymmetrik/node-fhir-server-core');
const { Calculator } = require('fqm-execution');
const url = require('url');
const { baseCreate, baseSearchById, baseRemove, baseUpdate } = require('./base.service');
const { createTransactionBundleClass } = require('../resources/transactionBundle');
const { uploadTransactionBundle } = require('./bundle.service');
const { getMeasureBundleFromId, getPatientDataBundle } = require('../util/bundleUtils');
const { findResourcesWithQuery } = require('../util/mongo.controller');

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

const search = async (args, { req }) => {
  logger.info('Measure >>> search');

  // Only supported params for now
  const { name, version } = args;

  const query = {
    ...(name ? { name } : {}),
    ...(version ? { version } : {})
  };

  const Bundle = resolveSchema(args.base_version, 'bundle');
  const Measure = resolveSchema(args.base_version, 'measure');

  const measures = await findResourcesWithQuery(query, 'Measure');

  return new Bundle({
    type: 'searchset',
    meta: { lastUpdated: new Date().toISOString() },
    total: measures.length,
    entry: measures.map(m => ({
      fullUrl: new url.URL(`Measure/${m.id}`, `http://${req.headers.host}/${args.base_version}/`),
      resource: new Measure(m)
    }))
  });
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
    //TODOMAYBE: add functionality for if resource is itself a bundle

    tb.addEntryFromResource(param.resource, 'POST');
  });

  req.body = tb.toJSON();
  const output = await uploadTransactionBundle(req, req.res);
  return output;
};

/**
 * Get all data requirements for a given measure as a FHIR Library
 * @param {Object} args the args object passed in by the user, includes measure id
 * @returns FHIR Library with all data requirements
 */
const dataRequirements = async (args, { req }) => {
  logger.info('Measure >>> $data-requirements');

  const id = args.id || req.params.id;

  const measureBundle = await getMeasureBundleFromId(id);

  const { results } = await Calculator.calculateDataRequirements(measureBundle);
  return results;
};

const evaluateMeasure = async (args, { req }) => {
  logger.info('Measure >>> $evaluate-measure');
  const measureBundle = await getMeasureBundleFromId(args.id);
  const dataReq = await Calculator.calculateDataRequirements(measureBundle);

  const { periodStart, periodEnd, subject } = req.query;

  const patientBundle = await getPatientDataBundle(subject, dataReq.results.dataRequirement);

  const { results } = await Calculator.calculateMeasureReports(measureBundle, [patientBundle], {
    measurementPeriodStart: periodStart,
    measurementPeriodEnd: periodEnd
  });
  return results;
};

const careGaps = async (args, { req }) => {
  logger.info('Measure >>> $care-gaps');
  const { measureId, periodStart, periodEnd, subject } = req.query;
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
