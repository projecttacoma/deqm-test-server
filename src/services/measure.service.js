const { BadRequestError, ResourceNotFoundError } = require('../util/errorUtils');
const { Calculator } = require('fqm-execution');
const { baseCreate, baseSearchById, baseRemove, baseUpdate, baseSearch } = require('./base.service');
const { createTransactionBundleClass } = require('../resources/transactionBundle');
const { executePingAndPull } = require('./import.service');
const { handleSubmitDataBundles } = require('./bundle.service');
const importQueue = require('../queue/importQueue');
const { retrieveExportUrl } = require('../util/exportUtils');
const {
  validateEvalMeasureParams,
  validateCareGapsParams,
  validateDataRequirementsParams,
  gatherParams
} = require('../util/validationUtils');
const {
  getMeasureBundleFromId,
  assembleCollectionBundleFromMeasure,
  getQueryFromReference
} = require('../util/bundleUtils');
const {
  getPatientDataCollectionBundle,
  retrievePatientIds,
  filterPatientIdsFromGroup
} = require('../util/patientUtils');
const {
  addPendingBulkImportRequest,
  findOneResourceWithQuery,
  findResourcesWithQuery,
  findResourceById
} = require('../database/dbOperations');
const { getResourceReference } = require('../util/referenceUtils');
const logger = require('../server/logger');

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
 * If 'prefer': 'respond-async' header is present, calls bulkImportFromRequirements.
 * @param {Object} args the args object passed in by the user
 * @param {Object} req the request object passed in by the user
 * @returns {Object} a transaction-response bundle
 */
const submitData = async (args, { req }) => {
  logger.info('Measure >>> $submit-data');
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);

  if (req.body.resourceType !== 'Parameters') {
    throw new BadRequestError(`Expected 'resourceType: Parameters'. Received 'type: ${req.body.resourceType}'.`);
  }
  if (!req.body.parameter) {
    throw new BadRequestError(`Unreadable or empty entity for attribute 'parameter'. Received: ${req.body.parameter}`);
  }
  const parameters = req.body.parameter;
  // Ensure exactly 1 measureReport is in parameters
  const numMeasureReportsInput = parameters.filter(
    param => param.name === 'measureReport' || param.resource?.resourceType === 'MeasureReport'
  ).length;
  if (numMeasureReportsInput !== 1) {
    throw new BadRequestError(
      `Expected exactly one resource with name: 'measureReport' and/or resourceType: 'MeasureReport. Received: ${numMeasureReportsInput}`
    );
  }

  // check if we want to do a bulk import
  if (req.headers['prefer'] === 'respond-async') {
    return await bulkImportFromRequirements(args, { req });
  }

  const { base_version: baseVersion } = req.params;
  const tb = createTransactionBundleClass(baseVersion);
  parameters.forEach(param => {
    //TODO: add functionality for if resource is itself a bundle

    tb.addEntryFromResource(param.resource, 'POST');
  });
  const output = await handleSubmitDataBundles([tb], req);
  // expect exactly one output because uses exactly one transaction bundle
  logger.info('Completed $submit-data request');
  return output[0];
};

/**
 * Retrieves measure bundle from the measure ID and
 * maps data requirements into an export request, which is
 * returned to the initial import client.
 * @param {Object} args the args object passed in by the user
 * @param {Object} req the request object passed in by the user
 */
const bulkImportFromRequirements = async (args, { req }) => {
  logger.info('Measure >>> $bulk-import');
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);

  // id of inserted client
  const clientEntry = await addPendingBulkImportRequest();
  const res = req.res;

  // use measure ID and export server location to map to data-requirements
  let measureId;
  let measureBundle;
  const parameters = req.body.parameter;
  // case 1: request is in Measure/<id>/$submit-data format
  if (req.params.id) {
    measureId = req.params.id;
    measureBundle = await getMeasureBundleFromId(measureId);
  }
  // case 2: request is in Measure/$submit-data format
  else {
    const measureReport = parameters.filter(param => param.resource?.resourceType === 'MeasureReport')[0];
    // get measure resource from db that matches measure param since no id is present in request
    const query = getQueryFromReference(measureReport.resource.measure);
    const measureResource = await findOneResourceWithQuery(query, 'Measure');
    measureId = measureResource.id;
    measureBundle = await getMeasureBundleFromId(measureId);
  }

  // retrieve data requirements
  const exportURL = retrieveExportUrl(parameters);
  const jobData = {
    clientEntry,
    exportURL,
    measureBundle
  };
  await importQueue.createJob(jobData).save();
  res.status(202);
  res.setHeader(
    'Content-Location',
    `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/bulkstatus/${clientEntry}`
  );
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

  validateDataRequirementsParams(req.query);

  const measureBundle = await getMeasureBundleFromId(id);

  const { periodStart, periodEnd } = req.query;
  const { results } = Calculator.calculateDataRequirements(measureBundle, {
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
 * @returns {Object} FHIR MeasureReport with population results
 */
const evaluateMeasure = async (args, { req }) => {
  logger.info('Measure >>> $evaluate-measure');
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);

  // throw errors if missing required params, using unsupported params,
  // or using unsupported report type
  validateEvalMeasureParams(req.query);

  return req.query.reportType === 'population'
    ? evaluateMeasureForPopulation(args, { req })
    : evaluateMeasureForIndividual(args, { req });
};

/**
 * Evaluate measure for "population" report type
 * @param {Object} args the args object passed in by the user, includes measure id
 * @param {Object} req http request object
 * @returns {Object} FHIR MeasureReport with population results
 */
const evaluateMeasureForPopulation = async (args, { req }) => {
  const measureBundle = await getMeasureBundleFromId(args.id);
  const dataReq = Calculator.calculateDataRequirements(measureBundle, {
    measurementPeriodStart: req.query.periodStart,
    measurementPeriodEnd: req.query.periodEnd
  });
  let patientBundles = [];
  if (req.query.subject) {
    const subjectReference = req.query.subject.split('/');
    const group = await findResourceById(subjectReference[1], subjectReference[0]);
    if (!group) {
      throw new ResourceNotFoundError(
        `No resource found in collection: ${subjectReference[0]}, with: id ${subjectReference[1]}.`
      );
    }
    if (req.query.practitioner) {
      const patients = await filterPatientIdsFromGroup(group, req.query.practitioner);
      if (patients.length === 0) {
        throw new BadRequestError(
          `The given subject, ${req.query.subject}, does not reference the given practitioner, ${req.query.practitioner}`
        );
      } else {
        patientBundles = patients.map(async p => {
          return getPatientDataCollectionBundle(p.id, dataReq.results.dataRequirement);
        });
      }
    } else {
      patientBundles = group.member.map(async m => {
        return getPatientDataCollectionBundle(m.entity.reference, dataReq.results.dataRequirement);
      });
    }
  } else {
    let patients;
    if (req.query.practitioner) {
      patients = await findResourcesWithQuery(
        getResourceReference('generalPractitioner', req.query.practitioner),
        'Patient'
      );
      if (patients.length === 0) {
        throw new BadRequestError(`No Patient resources reference the given practitioner, ${req.query.practitioner}`);
      }
    } else {
      patients = await findResourcesWithQuery({}, 'Patient');
    }
    patientBundles = patients.map(async p => {
      return getPatientDataCollectionBundle(p.id, dataReq.results.dataRequirement);
    });
  }
  patientBundles = await Promise.all(patientBundles);
  const { periodStart, periodEnd } = req.query;
  const { results } = await Calculator.calculateMeasureReports(measureBundle, patientBundles, {
    measurementPeriodStart: periodStart,
    measurementPeriodEnd: periodEnd,
    reportType: 'summary'
  });

  logger.info('Successfully generated $evaluate-measure report');
  return results;
};

/**
 * Evaluate measure for "individual" report type
 * @param {Object} args the args object passed in by the user, includes measure id
 * @param {Object} req http request object
 * @returns {Object} FHIR MeasureReport with population results
 */
const evaluateMeasureForIndividual = async (args, { req }) => {
  const measureBundle = await getMeasureBundleFromId(args.id);
  const dataReq = Calculator.calculateDataRequirements(measureBundle, {
    measurementPeriodStart: req.query.periodStart,
    measurementPeriodEnd: req.query.periodEnd
  });

  const { periodStart, periodEnd, reportType = 'individual', subject, practitioner } = req.query;
  let patientBundle;
  if (practitioner) {
    let patientId = subject;

    if (subject.includes('/')) {
      patientId = subject.split('/')[1];
    }

    const query = {
      id: patientId,
      ...getResourceReference('generalPractitioner', practitioner)
    };

    const patient = await findOneResourceWithQuery(query, 'Patient');
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
    reportType: reportType
  });
  return results[0];
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
  const searchTerm = retrieveSearchTerm(query);
  if (req.method === 'POST') {
    req.body = searchTerm;
  } else {
    req.query = searchTerm;
  }
  const measures = [];
  if (query.program) {
    const progArr = Array.isArray(query.program) ? query.program : [query.program];
    // build query AND-ing all potential program parameters
    const programQuery = {
      $and: progArr.map(program => {
        if (program.includes('|')) {
          return systemCodeProgramQuery(program);
        } else {
          return basicProgramQuery(program);
        }
      })
    };
    // TODO: add any searchTerm (measure identifier) query ANDed with above query
    const programMeasures = await findResourcesWithQuery(programQuery, 'Measure');
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
    const dataReq = Calculator.calculateDataRequirements(measureBundle, {
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
 * @returns {Object} an object containing the measure identifier with the appropriate key
 */
const retrieveSearchTerm = query => {
  const { measureId, measureIdentifier, measureUrl } = query;
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
  careGaps,
  executePingAndPull
};
