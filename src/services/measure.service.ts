//@ts-nocheck
const { BadRequestError, ResourceNotFoundError } = require('../util/errorUtils');
const { Calculator } = require('fqm-execution');
const { baseCreate, baseSearchById, baseRemove, baseUpdate, baseSearch } = require('./base.service');
const { handleSubmitDataBundles } = require('./bundle.service');
const {
  validateEvalMeasureParams,
  validateCareGapsParams,
  validateCollectDataParams,
  gatherParams,
  checkSubmitDataBody
} = require('../util/operationValidationUtils');
const {
  getMeasureBundleFromId,
  assembleCollectionBundleFromMeasure,
  getMeasureBundleFromUrl
} = require('../util/bundleUtils');
const {
  getPatientDataCollectionBundle,
  retrievePatientIds,
  filterPatientByPractitionerFromIds
} = require('../util/patientUtils');
const {
  patientSpecificDataRequirements,
  getPatientIds,
  pullResourceReferences,
  createDataExchangeMeasureReport,
  wrapReportsInBundlesParameters,
  basicProgramQuery,
  systemCodeProgramQuery,
  retrieveSearchTerm
} = require('../util/measureUtils');
const { findResourcesWithQuery } = require('../database/dbOperations');
import logger from '../server/logger';
const { v4: uuidv4 } = require('uuid');
const { ScaledCalculation } = require('../queue/execQueue');
import _ from 'lodash';

/**
 * resulting function of sending a POST request to {BASE_URL}/4_0_1/Measure
 * creates a new measure in the database
 * @param {undefined} _ unused arg
 * @param {Object} data the measure data passed in with the request
 * @returns {Object} an object with the created measure's id
 */
const create = async (_, data) => {
  return baseCreate(data, 'Measure');
};

/**
 * result of sending a GET request to {BASE_URL}/4_0_1/Measure/{id}
 * searches for the measure with the passed in id
 * @param {Object} args passed in arguments including the id of the sought after measure
 * @returns {Object} the FHIR resource with the specified id
 */
const searchById = async args => {
  return baseSearchById(args, 'Measure');
};

/**
 * result of sending a PUT request to {BASE_URL}/4_0_1/Measure/{id}
 * updates the measure with the passed in id using the passed in data
 * @param {Object} args passed in arguments including the id of the sought after measure
 * @param {Object} data a map of the attributes to change and their new values
 * @returns {string} the id of the updated/created resource
 */
const update = async (args, data) => {
  return baseUpdate(args, data, 'Measure');
};

/**
 * result of sending a DELETE request to {BASE_URL}/4_0_1/Measure/{id}
 * removes the measure with the passed in id from the database
 * @param {Object} args passed in arguments including the id of the sought after measure
 * @returns {Object} an object containing deletedCount: the number of documents deleted
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
 * result of sending a GET request to {BASE_URL}/4_0_1/Measure
 * queries for all measures matching the criteria, only name and version for now
 * @param {Object} args passed in arguments including the search parameters for the Measure
 * @param {Object} req http request object
 * @returns {Object} Search set result bundle
 */
const search = async (args, { req }) => {
  return baseSearch(args, { req }, 'Measure', SEARCH_PARAM_DEFS);
};

/**
 * Takes a measureReport and a set of required data as part of the request. Calculates the measure and
 * creates new documents for the measureReport and required data in the appropriate collections.
 *
 * @param {Object} args the args object passed in by the user
 * @param {Object} req the request object passed in by the user
 * @returns {Object} a transaction-response bundle
 */
const submitData = async (args, { req }) => {
  logger.info('Measure >>> $submit-data');
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);

  checkSubmitDataBody(req.body);
  const parameters = req.body.parameter;
  const output = await handleSubmitDataBundles(
    parameters.map(p => p.resource),
    req
  );

  logger.info('Completed $submit-data request');
  const parameterEntries = output.map(responseBundle => {
    return { name: 'responseBundle', resource: responseBundle };
  });
  const responseParams = {
    resourceType: 'Parameters',
    parameter: parameterEntries
  };
  return responseParams;
};

/**
 * Get all data requirements for a given measure as a FHIR Library
 * @param {Object} args the args object passed in by the user, includes measure id
 * @returns {Object} FHIR Library with all data requirements
 */
const dataRequirements = async (args, { req }) => {
  logger.info('Measure >>> $data-requirements');
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);

  const id = args.id;

  const measureBundle = await getMeasureBundleFromId(id);

  const { periodStart, periodEnd } = req.query;
  const { results } = await Calculator.calculateDataRequirements(measureBundle, {
    measurementPeriodStart: periodStart,
    measurementPeriodEnd: periodEnd
  });
  logger.info('Successfully generated $data-requirements report');
  return results;
};

/**
 * Initiate a collect data request (supports invited pull workflow only) according to
 * https://hl7.org/fhir/uv/deqm/2026May/en/OperationDefinition-collect-data.html
 * dataEndpoint (Endpoint typed parameter) presumed to be required for this implementation, so POST support only
 * @param {Object} args the args object passed in by the user
 * @param {Object} req http request object
 * @returns {Object} Parameters resource containing one or more Bundles of data exchange MeasureReports.
 */
const collectData = async (args, { req }) => {
  logger.info('Measure >>> $collect-data');
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);

  const { base_version: baseVersion } = req.params;
  const query = gatherParams(req.query, req.body);

  validateCollectDataParams(query);
  const { measureUrl, periodStart, periodEnd, subject, subjectGroup, dataEndpoint } = query;

  const options = {
    measurementPeriodStart: periodStart,
    measurementPeriodEnd: periodEnd,
    useExpandedCodeQueries: true
  };
  const patientIds = await getPatientIds(subject, subjectGroup);
  const measureUrls = Array.isArray(measureUrl) ? measureUrl : [measureUrl];
  const measureBundles = await Promise.all(measureUrls.map(async url => getMeasureBundleFromUrl(url)));

  const parameters = await Promise.all(
    patientIds.map(async patientId => {
      const measureReportEntries = await Promise.all(
        measureBundles.map(async measureBundle => {
          const patientDR = await patientSpecificDataRequirements(measureBundle, patientId, options);
          const resourceReferences = await pullResourceReferences(patientDR, dataEndpoint, baseVersion);
          const measureReport = createDataExchangeMeasureReport(
            measureBundle,
            { start: periodStart, end: periodEnd },
            { reference: `Patient/${patientId}` },
            resourceReferences
          );
          return {
            resource: measureReport,
            request: {
              method: 'PUT',
              url: `MeasureReport/${measureReport.id}`
            },
            fullUrl: measureReport.fullUrl ?? `urn:uuid:${measureReport.id}`
          };
        })
      );
      return {
        name: 'return',
        resource: {
          type: 'transaction',
          resourceType: 'Bundle',
          id: uuidv4(),
          entry: measureReportEntries
        }
      };
    })
  );

  return {
    resourceType: 'Parameters',
    parameter: parameters
  };
};

/**
 * Execute the measure for a given Patient or Group
 * @param {Object} args the args object passed in by the user, includes measureUrl
 * @param {Object} req http request object
 * @returns {Object} Parameters resource containing one or more Bundles of MeasureReports.
 */
const evaluateMeasure = async (args, { req }) => {
  logger.info('Measure >>> $evaluate');
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);

  let query;
  if (req.method === 'POST') {
    // Creates a new query from a combination of parameters in the body and query
    query = gatherParams(req.query, req.body);
  } else {
    query = req.query;
  }

  // throw errors if missing required params, using unsupported params,
  // or using unsupported report type
  validateEvalMeasureParams(query);

  const { reportType, subject, subjectGroup } = query;
  const subjectIds = await getPatientIds(subject, subjectGroup);

  // If reportType is not specified, default to 'subject', but
  // only if the 'subject' parameter is also specified
  if (
    reportType === 'subject' ||
    reportType === 'individual' ||
    (reportType == null && subject?.split('/')[0] === 'Patient')
  ) {
    logger.debug('Evaluating measure for individual');
    return evaluateMeasureForIndividual(query, subjectIds);
  }

  logger.debug('Evaluating measure for population');
  return evaluateMeasureForPopulation(query, subjectIds);
};

/**
 * Evaluate measure for "summary"/"population" report type
 */
const evaluateMeasureForPopulation = async (query, subjectIds) => {
  const measureBundles =
    query.measureUrl && Array.isArray(query.measureUrl)
      ? await Promise.all(query.measureUrl.map(async m => await getMeasureBundleFromUrl(m)))
      : [await getMeasureBundleFromUrl(query.measureUrl)];

  let patientIds = [];
  if (query.reporter) {
    const patients = await filterPatientByPractitionerFromIds(subjectIds, query.reporter);
    if (patients.length === 0) {
      throw new BadRequestError(
        `The given subject has no patients that reference the given practitioner, ${query.reporter}`
      );
    } else {
      patientIds = patients.map(p => p.id);
    }
  } else {
    patientIds = subjectIds;
  }

  const calcCount = patientIds.length * measureBundles.length;
  // count number of patientIds times measureBundles, if over threshold, then do them with workers, otherwise do it here
  if (process.env.EXEC_WORKERS > 0 && calcCount > process.env.SCALED_EXEC_THRESHOLD) {
    logger.info(
      `Starting scaled calculation run with ${patientIds.length} patients and ${measureBundles.length} measures`
    );
    const calc = new ScaledCalculation(measureBundles, patientIds, query.periodStart, query.periodEnd);
    return wrapReportsInBundlesParameters([await calc.execute()]);
  } else {
    logger.info(
      `Starting regular calculation run with ${patientIds.length} patients and ${measureBundles.length} measures`
    );
    const resultsPromises = measureBundles.map(async measureBundle => {
      const dataReq = await Calculator.calculateDataRequirements(measureBundle, {
        measurementPeriodStart: query.periodStart,
        measurementPeriodEnd: query.periodEnd
      });
      let patientBundles = patientIds.map(async id => {
        return getPatientDataCollectionBundle(id, dataReq.results.dataRequirement);
      });
      patientBundles = await Promise.all(patientBundles);
      const { periodStart, periodEnd } = query;
      const { results } = await Calculator.calculateMeasureReports(measureBundle, patientBundles, {
        measurementPeriodStart: periodStart,
        measurementPeriodEnd: periodEnd,
        reportType: 'summary'
      });
      return results;
    });
    const allResults = await Promise.all(resultsPromises);

    logger.info('Successfully generated $evaluate reports');
    // an array of summary reports, one for each measure

    return wrapReportsInBundlesParameters([allResults]);
  }
};

/**
 * Evaluate measure for "individual"/"subject" report type
 */
const evaluateMeasureForIndividual = async (query, subjectIds) => {
  // TODO: we currently don't bother to check for a scaled execution option here since we formerly only
  // ran this for single patient inputs. Consider consolidating the approach with the above evaluateMeasureForPopulation
  // and introducing scaled execution for individual report generation across several patients and measures
  const measureBundles =
    query.measureUrl && Array.isArray(query.measureUrl)
      ? await Promise.all(query.measureUrl.map(async m => await getMeasureBundleFromUrl(m)))
      : [await getMeasureBundleFromUrl(query.measureUrl)];

  let patientIds = [];
  if (query.reporter) {
    const patients = await filterPatientByPractitionerFromIds(subjectIds, query.reporter);
    if (patients.length === 0) {
      throw new BadRequestError(
        `The given subject has no patients that reference the given practitioner, ${query.reporter}`
      );
    } else {
      patientIds = patients.map(p => p.id);
    }
  } else {
    patientIds = subjectIds;
  }

  const resultsPromises = measureBundles.map(async measureBundle => {
    const dataReq = await Calculator.calculateDataRequirements(measureBundle, {
      measurementPeriodStart: query.periodStart,
      measurementPeriodEnd: query.periodEnd
    });
    let patientBundles = patientIds.map(async id => {
      return getPatientDataCollectionBundle(id, dataReq.results.dataRequirement);
    });
    patientBundles = await Promise.all(patientBundles);

    const { results } = await Calculator.calculateMeasureReports(measureBundle, patientBundles, {
      measurementPeriodStart: query.periodStart,
      measurementPeriodEnd: query.periodEnd,
      reportType: 'individual'
    });
    // an array of individual measure reports for each subject
    return results;
  });

  // an array of arrays of individual measure reports
  const allResults = await Promise.all(resultsPromises);

  // change by-measure array of patient results arrays to by-patient array of measure results arrays
  const transposedResults = _.zip(...allResults);
  return wrapReportsInBundlesParameters(transposedResults);
};

/**
 * Calculate the gaps in care for a given Patient
 * @param {Object} args the args object passed in by the user, includes measure id
 * @param {Object} req http request object
 * @returns {Object} FHIR MeasureReport with population results
 */
const careGaps = async (args, { req }) => {
  logger.info('Measure >>> $care-gaps');
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  let query;
  if (req.method === 'POST') {
    // Creates a new query from a combination of parameters in the body and query
    query = gatherParams(req.query, req.body);
  } else {
    query = req.query;
  }
  validateCareGapsParams(query);

  const { periodStart, periodEnd } = query;
  let searchTerm = retrieveSearchTerm(query, true);
  if (req.method === 'POST') {
    req.body = searchTerm;
  } else {
    req.query = searchTerm;
  }
  const measures = [];
  if (query.program) {
    const progArr = Array.isArray(query.program) ? query.program : [query.program];
    // build query AND-ing all potential program parameters

    let measureQuery = {};
    if (searchTerm) {
      searchTerm = retrieveSearchTerm(query, false);
      const prop = Object.keys(searchTerm)[0];

      // for now assume we only support one of a possible identifier property

      if (Array.isArray(searchTerm[prop])) {
        searchTerm[prop] = { $in: searchTerm[prop] };

        measureQuery = searchTerm;
      } else {
        measureQuery = searchTerm;
      }
    }
    const programQuery = {
      $and: progArr.map(program => {
        if (program.includes('|')) {
          return systemCodeProgramQuery(program);
        } else {
          return basicProgramQuery(program);
        }
      })
    };

    const programMeasures = await findResourcesWithQuery({ $and: [programQuery, measureQuery] }, 'Measure');
    measures.push(...programMeasures);
  } else if (!searchTerm) {
    /*
      If no search term, circumvent asymmetrik query builder and use mongo search directly to avoid
      pagination bug
      
      TODO: Remove this code once pagination bug is fixed
    */
    measures.push(...(await findResourcesWithQuery({}, 'Measure')));
  } else {
    //Use the base search function here to allow search by measureId, measureUrl, and measureIdentifier
    const searchResults = await search(args, { req });
    if (searchResults.total === 0) {
      //We know the search term will have exactly one key and value, so just fill them in in the error message
      throw new ResourceNotFoundError(
        `no measure found with ${Object.keys(searchTerm)[0]}: ${searchTerm[Object.keys(searchTerm)[0]]}.`
      );
    }

    const measureResources = searchResults.entry.map(e => e.resource);
    measures.push(...measureResources);
  }

  let gapsResults = measures.map(async measure => {
    const measureBundle = await assembleCollectionBundleFromMeasure(measure);

    logger.info(`Calculating data requirements for measure ${measure.id}`);
    const dataReq = await Calculator.calculateDataRequirements(measureBundle, {
      measurementPeriodStart: periodStart,
      measurementPeriodEnd: periodEnd
    });
    const patientIds = await retrievePatientIds(query);

    let patientBundles = patientIds.map(async m => {
      return getPatientDataCollectionBundle(`Patient/${m}`, dataReq.results.dataRequirement);
    });

    patientBundles = await Promise.all(patientBundles);
    if (patientBundles.length === 0) {
      return [];
    }
    logger.info(`Calculating gaps in care for measure ${measure.id}`);
    const { results } = await Calculator.calculateGapsInCare(measureBundle, patientBundles, {
      measurementPeriodStart: periodStart,
      measurementPeriodEnd: periodEnd
    });

    const responseParametersArray = [];
    if (results.length > 1) {
      results.forEach(result => {
        responseParametersArray.push({
          name: 'return',
          resource: result
        });
      });
    } else {
      responseParametersArray.push({
        name: 'return',
        resource: results
      });
    }
    return responseParametersArray;
  });

  gapsResults = await Promise.all(gapsResults);
  // Flatten nested gaps reports and only add the gaps reports that are non-empty
  gapsResults = gapsResults.flat().filter(gapReport => gapReport.resource.resourceType);

  const responseParameters = {
    resourceType: 'Parameters',
    parameter: [...gapsResults]
  };
  logger.info('Successfully generated $care-gaps report');
  return responseParameters;
};

module.exports = {
  create,
  searchById,
  remove,
  update,
  search,
  submitData,
  dataRequirements,
  collectData,
  evaluateMeasure,
  careGaps
};
