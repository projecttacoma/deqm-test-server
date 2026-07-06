//@ts-nocheck
const { BadRequestError, ResourceNotFoundError } = require('../util/errorUtils');
const { Calculator } = require('fqm-execution');
const { baseCreate, baseSearchById, baseRemove, baseUpdate, baseSearch } = require('./base.service');
const { handleSubmitDataBundles, uploadResourcesFromBundle } = require('./bundle.service');
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
  filterPatientByPractitionerFromGroup
} = require('../util/patientUtils');
const { patientSpecificDataRequirements } = require('../util/collectDataUtils');
const {
  findOneResourceWithQuery,
  findResourcesWithQuery,
  findResourceIdsWithQuery,
  findResourceById
} = require('../database/dbOperations');
const { getResourceReference } = require('../util/referenceUtils');
import axios from 'axios';
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
            `Patient/${patientId}`,
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
 * Resolve the patients to include based on a subject or subjectGroup parameter.
 * @param {string} subject reference to a subject (Patient or Group) on the server
 * @param {Object} subjectGroup FHIR Group that defines a set of patients as the subject
 * @returns {Promise<string[]>} Patient ids.
 */
const getPatientIds = async (subject, subjectGroup) => {
  if (subject && subjectGroup) {
    throw new BadRequestError('Only one of subject or subjectGroup may be specified for $collect-data.');
  }

  if (subject) {
    if (Array.isArray(subject) || typeof subject !== 'string') {
      throw new BadRequestError('Parameter subject must be a single Patient or Group reference.');
    }
    const [resourceType, id] = subject.split('/');
    if (resourceType === 'Patient' && id) {
      return [id];
    }
    if (resourceType === 'Group' && id) {
      const group = await findResourceById(id, 'Group');
      if (!group) {
        throw new ResourceNotFoundError(`No resource found in collection: Group, with: id ${id}.`);
      }
      return getPatientIdsFromGroup(group);
    }
    throw new BadRequestError(
      'Subject may only be a Group resource of format "Group/{id}" or Patient resource of format "Patient/{id}".'
    );
  }

  if (subjectGroup) {
    if (Array.isArray(subjectGroup) || typeof subjectGroup === 'string' || subjectGroup.resourceType !== 'Group') {
      throw new BadRequestError('Parameter subjectGroup must be a FHIR Group resource.');
    }
    return getPatientIdsFromGroup(subjectGroup);
  }

  throw new BadRequestError('Must specify subject or subjectGroup.');
};

/**
 * Extract Patient ids from a Group resource.
 * @param {Object} group FHIR Group resource
 * @returns {string[]} Patient ids.
 */
const getPatientIdsFromGroup = group => {
  if (!group.member || group.member.length === 0) {
    throw new BadRequestError('Parameter subjectGroup or referenced Group must contain members.');
  }
  return group.member.map(member => {
    const reference = member.entity?.reference;
    if (!reference) {
      throw new BadRequestError('Group members must have references to Patients.');
    }
    const [resourceType, id] = reference.split('/');
    if (resourceType !== 'Patient' || !id) {
      throw new BadRequestError('Group members may only be Patient resource references of format "Patient/{id}".');
    }
    return id;
  });
};

/**
 * Pulls data for a set of patient-specific data requirements from the provided Endpoint and stores returned resources.
 * @param {Object} patientDR patient-specific data requirements
 * @param {Object} dataEndpoint FHIR Endpoint resource
 * @param {string} baseVersion FHIR base version
 * @returns {Promise<Object[]>} Resource Reference object created from the results of Endpoint queries.
 */
const pullResourceReferences = async (patientDR, dataEndpoint, baseVersion) => {
  const queries = _.uniq(
    patientDR.results.dataRequirement?.flatMap(dr => {
      return (
        dr.extension
          ?.filter(e => e.url === 'http://hl7.org/fhir/us/cqfmeasures/StructureDefinition/cqfm-fhirQueryPattern')
          .map(e => `${dataEndpoint.address}${e.valueString}`) ?? []
      );
    }) ?? []
  );
  const serverUrl = `${process.env.BASE_URL}/${baseVersion}`;

  // Track an array of references for the resources returned from each query
  const resourceReferenceArrays = await Promise.all(
    queries.map(async query => {
      const bundle = await axios.get(query).then(response => response.data);
      if (bundle.entry) {
        const originalReferences = bundle.entry?.map(e =>
          e.resource?.resourceType && e.resource?.id ? `${e.resource.resourceType}/${e.resource.id}` : null
        );
        //TODO: ideally do a POST-based transaction bundle implementation (currently PUT), which may replace references with new ids
        const results = await uploadResourcesFromBundle(bundle.entry, baseVersion);
        // Get new ids
        const references = originalReferences
          .map((refString, i) => {
            if (!refString) return null;
            // Note: newRef may be an operation outcome if there are issues uploading the resource. Leaving this behavior as is for now.
            const newRef =
              results[i].resource?.resourceType && results[i].resource?.id
                ? `${results[i].resource.resourceType}/${results[i].resource.id}`
                : null;
            return {
              reference: refString,
              identifier: {
                system: serverUrl,
                value: newRef
              }
            };
          })
          .filter(Boolean);
        return references;
      }
      return [];
    })
  );
  return _.uniqBy(resourceReferenceArrays.flat(), r => JSON.stringify(r));
};

/**
 * Build a DEQM data exchange MeasureReport for the resources collected for a patient/measure pair.
 * @param {Object} measureBundle FHIR Bundle containing a Measure resource
 * @param {Object} period Measurement period with start and end
 * @param {string} subjectReference Patient reference
 * @param {Object[]} resourceReferences FHIR References to resources returned from data collection queries
 * @returns {Object} FHIR MeasureReport
 */
const createDataExchangeMeasureReport = (measureBundle, period, subjectReference, resourceReferences) => {
  const measure = measureBundle.entry?.find(e => e.resource.resourceType === 'Measure').resource;
  return {
    resourceType: 'MeasureReport',
    id: uuidv4(),
    measure: measure.url?.includes('|') ? measure.url : `${measure.url}|${measure.version}`, //canonical measure/version
    period: period,
    status: 'complete',
    type: 'data-collection',
    subject: { reference: subjectReference },
    date: new Date().toISOString(),
    reporter: { reference: 'Organization/deqm-test-server' },
    meta: {
      profile: ['http://hl7.org/fhir/uv/deqm/StructureDefinition/deqm-dataexchangemeasurereport']
    },
    extension: [
      {
        url: 'http://hl7.org/fhir/uv/deqm/StructureDefinition/deqm-submitDataUpdateType"',
        valueCode: 'snapshot'
      }
    ],
    evaluatedResource: resourceReferences,
    contained: [{ resourceType: 'Organization', id: 'deqm-test-server' }]
  };
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
  collectData,
  evaluateMeasure,
  careGaps
};
