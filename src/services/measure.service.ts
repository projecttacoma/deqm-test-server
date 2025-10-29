//@ts-nocheck
const { BadRequestError, ResourceNotFoundError } = require('../util/errorUtils');
const { Calculator } = require('fqm-execution');
const { baseCreate, baseSearchById, baseRemove, baseUpdate, baseSearch } = require('./base.service');
const { handleSubmitDataBundles } = require('./bundle.service');
const {
  validateEvalMeasureParams,
  validateCareGapsParams,
  gatherParams,
  checkSubmitDataBody
} = require('../util/operationValidationUtils');
const { getMeasureBundleFromId, assembleCollectionBundleFromMeasure } = require('../util/bundleUtils');
const {
  getPatientDataCollectionBundle,
  retrievePatientIds,
  filterPatientByPractitionerFromGroup
} = require('../util/patientUtils');
const {
  findOneResourceWithQuery,
  findResourcesWithQuery,
  findResourceIdsWithQuery,
  findResourceById
} = require('../database/dbOperations');
const { getResourceReference } = require('../util/referenceUtils');
import logger from '../server/logger';
const { ScaledCalculation } = require('../queue/execQueue');

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
 * Execute the measure for a given Patient or Group
 * @param {Object} args the args object passed in by the user, includes measure id
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
  validateEvalMeasureParams(query, args.id);

  const { reportType, subject } = query;

  // If reportType is not specified, default to 'subject', but
  // only if the 'subject' parameter is also specified
  if (reportType === 'subject' || (reportType == null && subject != null)) {
    logger.debug('Evaluating measure for individual');
    return evaluateMeasureForIndividual(args, query);
  }

  logger.debug('Evaluating measure for population');
  return evaluateMeasureForPopulation(args, query);
};

/**
 * Evaluate measure for "population" report type
 * @param {Object} args the args object passed in by the user, includes measure id
 * @param {Object} req http request object
 * @returns {Object} Parameters resource containing one Bundle with measureReports.
 */
const evaluateMeasureForPopulation = async (args, query) => {
  const measureBundles =
    query.measureId && Array.isArray(query.measureId)
      ? await Promise.all(query.measureId.map(async m => await getMeasureBundleFromId(m)))
      : [await getMeasureBundleFromId(args.id ?? query.measureId)];
  // Collect patientId instead of bundles
  let patientIds = [];
  if (query.subject || query.subjectGroup) {
    let group;
    if (query.subjectGroup) {
      group = query.subjectGroup;
    } else {
      const subjectReference = query.subject.split('/');
      group = await findResourceById(subjectReference[1], subjectReference[0]);
      if (!group) {
        throw new ResourceNotFoundError(
          `No resource found in collection: ${subjectReference[0]}, with: id ${subjectReference[1]}.`
        );
      }
    }
    if (query.practitioner) {
      const patients = await filterPatientByPractitionerFromGroup(group, query.practitioner);
      if (patients.length === 0) {
        throw new BadRequestError(
          `The given subject with id, ${group.id}, does not reference the given practitioner, ${query.practitioner}`
        );
      } else {
        patientIds = patients.map(p => p.id);
      }
    } else {
      patientIds = group.member.map(m => {
        const ref = m.entity.reference.split('/');
        return ref[1];
      });
    }
  } else {
    if (query.practitioner) {
      patientIds = await findResourceIdsWithQuery(
        getResourceReference('generalPractitioner', query.practitioner),
        'Patient'
      );
      if (patientIds.length === 0) {
        throw new BadRequestError(`No Patient resources reference the given practitioner, ${query.practitioner}`);
      }
    } else {
      patientIds = await findResourceIdsWithQuery({}, 'Patient');
    }
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
 * Evaluate measure for "individual" report type
 * @param {Object} args the args object passed in by the user, includes measure id
 * @param {Object} req http request object
 * @returns {Object} Parameters resource containing one Bundle with a single MeasureReport.
 */
const evaluateMeasureForIndividual = async (args, query) => {
  const measureBundles =
    query.measureId && Array.isArray(query.measureId)
      ? await Promise.all(query.measureId.map(async m => await getMeasureBundleFromId(m)))
      : [await getMeasureBundleFromId(args.id ?? query.measureId)];

  const resultsPromises = measureBundles.map(async measureBundle => {
    const dataReq = await Calculator.calculateDataRequirements(measureBundle, {
      measurementPeriodStart: query.periodStart,
      measurementPeriodEnd: query.periodEnd
    });

    const { periodStart, periodEnd, subject, practitioner } = query;
    let patientBundle;
    if (practitioner) {
      let patientId = subject;

      if (subject.includes('/')) {
        patientId = subject.split('/')[1];
      }

      const practitionerQuery = {
        id: patientId,
        ...getResourceReference('generalPractitioner', practitioner)
      };

      const patient = await findOneResourceWithQuery(practitionerQuery, 'Patient');
      if (patient) {
        patientBundle = await getPatientDataCollectionBundle(patient.id, dataReq.results.dataRequirement);
      } else {
        throw new BadRequestError(
          `The given subject, ${subject}, does not reference the given practitioner, ${practitioner}`
        );
      }
    } else {
      patientBundle = await getPatientDataCollectionBundle(subject, dataReq.results.dataRequirement);
    }

    const { results } = await Calculator.calculateMeasureReports(measureBundle, [patientBundle], {
      measurementPeriodStart: periodStart,
      measurementPeriodEnd: periodEnd,
      reportType: 'individual'
    });
    // Currently called with exactly one patient, so returns a single measure report in the array
    return results[0];
  });

  const allResults = await Promise.all(resultsPromises);

  return wrapReportsInBundlesParameters([allResults]);
};

/**
 * Wraps groups of measureReports in a Bundle, where each Bundle is grouped by subject, then wraps each Bundle in a return parameter
 * @param {Array<Object>} measureReportsArray An array where each entry is an array of measureReports associated with a specific subject.
 * @returns {Object} A FHIR Parameters resource containing one parameter per Bundle, where each parameter/bundle contains all measure reports for a single subject.
 */
const wrapReportsInBundlesParameters = measureReportsArray => {
  const parameterArray = measureReportsArray.map(measureReports => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: measureReports.map(report => ({
        resource: report
      }))
    };

    // every parameter has name 'return'
    return {
      name: 'return',
      resource: bundle
    };
  });

  return {
    resourceType: 'Parameters',
    parameter: parameterArray
  };
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

/**
 * Creates a query that searches for the program parameter as either a code or text element
 * @param {string} program program parameter of single code or text format
 * @returns {Object} the query data that searches for this program parameter
 */
const basicProgramQuery = program => {
  return {
    useContext: {
      $elemMatch: {
        'code.code': 'program',
        $or: [{ 'valueCodeableConcept.coding.code': program }, { 'valueCodeableConcept.text': program }]
      }
    }
  };
};

/**
 * Creates a query for a system|code formatted program parameter
 * @param {string} program program parameter of system|code format
 * @returns {Object} the query data that searches for this program parameter
 */
const systemCodeProgramQuery = program => {
  const [system, code] = program.split('|');
  return {
    useContext: {
      $elemMatch: {
        'code.code': 'program',
        'valueCodeableConcept.coding': {
          $elemMatch: {
            code: code,
            system: system
          }
        }
      }
    }
  };
};

/**
 * Determines the type of identifier used by the client to identify the measure and returns it
 * @param {Object} query http request query
 * @param {boolean} isForQb flag to indicate if the result will be used by the query build
 * or for a mongo query
 * @returns {Object} an object containing the measure identifier with the appropriate key
 */
const retrieveSearchTerm = (query, isForQb) => {
  const { measureId, measureIdentifier, measureUrl } = query;
  if (measureId) {
    //some manipulation will be needed here because _id means a generated id when interacting with mongo
    //however if this field is used with the Asymmetrik query builder it means the actual id of the measure
    // this overlap can cause some confusion
    return isForQb ? { _id: measureId } : { id: measureId };
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
