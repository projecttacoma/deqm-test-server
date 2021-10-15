const { ServerError, loggers } = require('@asymmetrik/node-fhir-server-core');
const { RequirementsQuery } = require('bulk-data-utilities');
const { Calculator } = require('fqm-execution');
const { baseCreate, baseSearchById, baseRemove, baseUpdate, baseSearch } = require('./base.service');
const { createTransactionBundleClass } = require('../resources/transactionBundle');
const { uploadTransactionBundle } = require('./bundle.service');
const { validateEvalMeasureParams } = require('../util/measureOperationsUtils');
const {
  getMeasureBundleFromId,
  getPatientDataBundle,
  assembleCollectionBundleFromMeasure,
  getQueryFromReference
} = require('../util/bundleUtils');
const {
  addPendingBulkImportRequest,
  findOneResourceWithQuery,
  findResourcesWithQuery
} = require('../util/mongo.controller');

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
 * creates new documents for the measureReport and requirements in the appropriate collections.
 *
 * If 'prefer': 'respond-async' header is present, calls bulkImport.
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
  const parameters = req.body.parameter;
  // Ensure exactly 1 measureReport is in parameters
  const numMeasureReportsInput = parameters.filter(
    param => param.name === 'measureReport' || param.resource.resourceType === 'MeasureReport'
  ).length;
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

  // check if we want to do a bulk import
  if (req.headers['prefer'] === 'respond-async') {
    return await bulkImport(args, { req });
  }

  const { base_version: baseVersion } = req.params;
  const tb = createTransactionBundleClass(baseVersion);
  parameters.forEach(param => {
    //TODO: add functionality for if resource is itself a bundle

    tb.addEntryFromResource(param.resource, 'POST');
  });
  req.body = tb.toJSON();
  const output = await uploadTransactionBundle(req, req.res);
  return output;
};

/**
 * "TO-DO: add bulk import funtionality" (sic)
 * Retrieves measure bundle from the measure ID and
 * maps data requirements into an export request, which is
 * returned to the intiial import client.
 * @param {*} args the args object passed in by the user
 * @param {*} req the request object passed in by the user
 */
const bulkImport = async (args, { req }) => {
  logger.info('Measure >>> $bulk-import');
  // id of inserted client
  const clientEntry = await addPendingBulkImportRequest();
  const res = req.res;
  res.status(202);
  res.setHeader('Content-Location', `${args.base_version}/bulkstatus/${clientEntry}`);
  //Temporary solution. Asymmetrik automatically rewrites this to a 200.
  //Rewriting the res.status method prevents the code from being overwritten.
  //TODO: change this once we fork asymmetrik
  res.status = () => res;

  // use measure ID and export server location to map to data-requirements
  let measureId;
  let measureBundle;

  // case 1: request is in Measure/<id>/$submit-data format
  if (req.params.id) {
    measureId = req.params.id;
    measureBundle = await getMeasureBundleFromId(measureId);
  }
  // case 2: request is in Measure/$submit-data format
  else {
    const parameters = req.body.parameter;
    const measureReport = parameters.filter(param => param.resource.resourceType === 'MeasureReport')[0];
    // get measure resource from db that matches measure param since no id is present in request
    const query = getQueryFromReference(measureReport.resource.measure);
    const measureResource = await findOneResourceWithQuery(query, 'Measure');
    measureId = measureResource.id;
    measureBundle = await getMeasureBundleFromId(measureId);
  }
  if (!measureBundle) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Could not find measure bundle with id ${measureId}`
          }
        }
      ]
    });
  }

  // retrieve data requirements
  const results = await RequirementsQuery.retrieveBulkDataFromMeasureBundle(measureBundle);
  return results;
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
  console.log(args.id);
  const measureBundle = await getMeasureBundleFromId(args.id);

  const dataReq = Calculator.calculateDataRequirements(measureBundle);

  // throw errors if missing required params, using unsupported params,
  // or using unsupported report type
  validateEvalMeasureParams(req);

  if (req.query.reportType === 'population') {
    const patients = await findResourcesWithQuery({}, 'Patient');
    let patientBundles = patients.map(async p => {
      return getPatientDataBundle(p.id, dataReq.results.dataRequirement);
    });

    patientBundles = await Promise.all(patientBundles);
    const { periodStart, periodEnd } = req.query;
    console.log(measureBundle);
    console.log(patientBundles);
    const { results } = await Calculator.calculateMeasureReports(measureBundle, patientBundles, {
      measurementPeriodStart: periodStart,
      measurementPeriodEnd: periodEnd,
      reportType: 'summary'
    });
    return results;
  }

  const { periodStart, periodEnd, reportType = 'individual', subject } = req.query;
  const patientBundle = await getPatientDataBundle(subject, dataReq.results.dataRequirement);

  const { results } = await Calculator.calculateMeasureReports(measureBundle, [patientBundle], {
    measurementPeriodStart: periodStart,
    measurementPeriodEnd: periodEnd,
    reportType: reportType
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

  validateCareGapsParams(req);

  const { periodStart, periodEnd, subject } = req.query;
  const searchTerm = retrieveSearchTerm(req);
  req.query = searchTerm;
  //Use the base search function here to allow search by measureId, measureUrl, and measureIdentifier
  const measure = await search(args, { req });
  if (measure.total === 0) {
    //We know the search term will have exactly one key and value, so just fill them in in the error message
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `no measure found with ${Object.keys(searchTerm)[0]}: ${searchTerm[Object.keys(searchTerm)[0]]}.`
          }
        }
      ]
    });
  }
  const measureBundle = await assembleCollectionBundleFromMeasure(measure.entry[0].resource);
  const dataReq = Calculator.calculateDataRequirements(measureBundle);

  const patientBundle = await getPatientDataBundle(subject, dataReq.results.dataRequirement);

  const { results } = await Calculator.calculateGapsInCare(measureBundle, [patientBundle], {
    measurementPeriodStart: periodStart,
    measurementPeriodEnd: periodEnd
  });
  return results;
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

  // Returns a list of all required params which are undefined on req.query
  const missingParams = REQUIRED_PARAMS.filter(key => !req.query[key]);

  if (missingParams.length > 0) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Missing required parameters for $care-gaps: ${missingParams.join(', ')}.`
          }
        }
      ]
    });
  }
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

const retrieveSearchTerm = req => {
  const { measureId, measureIdentifier, measureUrl } = req.query;

  if (measureId) {
    return { _id: measureId };
  } else if (measureIdentifier) {
    return { identifier: measureIdentifier };
  } else if (measureUrl) {
    return { url: measureUrl };
  } else {
    return null;
  }
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
