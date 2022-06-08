const { v4: uuidv4 } = require('uuid');
const { getSearchParameters, resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { BadRequestError, ResourceNotFoundError } = require('../util/errorUtils');
const QueryBuilder = require('@asymmetrik/fhir-qb');
const url = require('url');
const {
  findResourceById,
  createResource,
  removeResource,
  updateResource,
  findResourcesWithAggregation
} = require('../database/dbOperations');
const { checkProvenanceHeader, populateProvenanceTarget } = require('../util/provenanceUtils');
const { checkSupportedResource, checkContentTypeHeader, getCurrentInstant} = require('../util/baseUtils');
const logger = require('../server/logger.js');

/**
 * Query Builder Parameter Definitions for all resources
 */
const GLOBAL_PARAMETER_DEFINITIONS = {
  _id: {
    type: 'token',
    fhirtype: 'token',
    xpath: 'Resource.id',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-id',
    description: 'Logical id of this artifact',
    modifier: 'missing,text,not,in,not-in,below,above,ofType'
  },
  _lastUpdated: {
    type: 'date',
    fhirtype: 'date',
    xpath: 'Resource.meta.lastUpdated',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-lastUpdated',
    description: 'When the resource version last changed',
    modifier: 'missing'
  },
  _tag: {
    type: 'token',
    fhirtype: 'token',
    xpath: 'Resource.meta.tag',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-tag',
    description: 'Tags applied to this resource',
    modifier: 'missing,text,not,in,not-in,below,above,ofType'
  },
  _profile: {
    type: 'token',
    fhirtype: 'token',
    xpath: 'Resource.meta.profile',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-profile',
    description: 'Profiles this resource claims to conform to',
    modifier: 'missing,type,identifier'
  },
  _security: {
    type: 'token',
    fhirtype: 'token',
    xpath: 'Resource.meta.security',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-security',
    description: 'Security Labels applied to this resource',
    modifier: 'missing,text,not,in,not-in,below,above,ofType'
  },
  identifier: {
    type: 'token',
    fhirtype: 'Identifier',
    xpath: 'Resource.identifier'
  },
  url: {
    type: 'token',
    fhirtype: 'uri',
    xpath: 'Resource.url'
  }
};

const qb = new QueryBuilder({
  globalParameterDefinitions: GLOBAL_PARAMETER_DEFINITIONS,
  implementationParameters: { archivedParamPath: '_isArchived' }
});

/**
 * creates an object and generates an id for it regardless of the id passed in
 * @param {Object} req an object containing the request body
 * @param {string} resourceType string which signifies which collection to add the data to
 * @returns {string} the id of the created object
 */
const baseCreate = async ({ req }, resourceType) => {
  logger.info(`${resourceType} >>> create`);
  logger.debug(`Request args: ${JSON.stringify(req.args)}`);
  logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  checkContentTypeHeader(req.headers);
  const data = req.body;
  checkSupportedResource(data.resourceType);
  //Create a new id regardless of whether one is passed
  data['id'] = uuidv4();
  data['meta'] = {lastUpdated: getCurrentInstant(), ...data['meta']};
  if (req.headers['x-provenance']) {
    checkProvenanceHeader(req.headers);
    const res = req.res;
    populateProvenanceTarget(req.headers, res, [{ reference: `${resourceType}/${data.id}` }]);
  }
  return createResource(data, resourceType);
};

/**
 * Searches for the object of the requested type with the requested id
 * @param {Object} args the args added to the end of the url, contains id of desired resource
 * @param {string} resourceType string which signifies which collection to search for
 * the data and which FHIR type to cast the result to
 * @returns {Object} the object with the desired id cast to the requested type
 */
const baseSearchById = async (args, resourceType) => {
  logger.debug(`${resourceType} >>> read`);
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  const dataType = resolveSchema(args.base_version, resourceType.toLowerCase());
  const result = await findResourceById(args.id, resourceType);
  if (!result) {
    throw new ResourceNotFoundError(`No resource found in collection: ${resourceType}, with: id ${args.id}`);
  }
  return new dataType(result);
};

/**
 * Searches using query parameters.
 * @param {Object} args The args from the request.
 * @param {Object} req The Express request object. This is used by the query builder.
 * @param {string} resourceType The resource type we are searching on.
 * @param {Object} paramDefs Optional parameter definitions for the specific resource types. Specific
 *                      resource services should call this and pass along supported params
 * @returns {Object} Search set result bundle
 */
const baseSearch = async (args, { req }, resourceType, paramDefs) => {
  logger.debug(`${resourceType} >>> search`);
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  logger.debug(`Passed in paramDefs: ${JSON.stringify(paramDefs)}`);
  // grab the schemas for the data type and Bundle to use for response
  const dataType = resolveSchema(args.base_version, resourceType.toLowerCase());
  const Bundle = resolveSchema(args.base_version, 'bundle');

  // Represents search params retrieved from fhir spec, or custom params specified by resource service
  let searchParams;

  if (!paramDefs) {
    searchParams = {};
    const searchParameterList = getSearchParameters(resourceType, args.base_version);
    searchParameterList.forEach(async paramDef => {
      {
        searchParams[paramDef.name] = paramDef;
      }
    });
  } else {
    searchParams = paramDefs;
  }

  // wipe out params since the 'base_version' here breaks the query building
  req.params = {};

  // build result bundle. default to an empty result
  const searchBundle = new Bundle({
    type: 'searchset',
    meta: { lastUpdated: new Date().toISOString() },
    total: 0
  });
  // build the aggregation query
  logger.debug('Building search query');
  const filter = qb.buildSearchQuery({ req: req, includeArchived: true, parameterDefinitions: searchParams });

  // if the query builder was able to build a query actually execute it.
  if (filter.query) {
    logger.debug(`Executing aggregation search over ${resourceType}s using query: ${JSON.stringify(filter.query)}`);
    // grab the results from aggregation. has metadata about counts and data with resources in the first array position
    const results = (await findResourcesWithAggregation(filter.query, resourceType))[0];

    // If this is undefined, there are no results.
    if (results && results.metadata[0]) {
      // create instances of each of the resulting resources
      const resultEntries = results.data.map(result => {
        return {
          fullUrl: new url.URL(
            `${result.resourceType}/${result.id}`,
            `http://${req.headers.host}/${args.base_version}/`
          ),
          resource: new dataType(result)
        };
      });

      searchBundle.total = results.metadata[0].total;
      searchBundle.entry = resultEntries;
    }
  } else {
    // If there were issues with query building, throw an error. Use the provided error if possible.
    const errorMessage = filter.errors[0] ? filter.errors[0].message : 'Issue parsing parameters.';
    throw new BadRequestError(errorMessage);
  }
  return searchBundle;
};

/**
 * updates the document of the specified resource type with the passed in id or creates a new
 * document if no document with passed id is found
 * @param {Object} args the args added to the end of the url, contains id of desired resource
 * @param {Object} req an object containing the request body
 * @param {string} resourceType string which signifies which collection to add the data to
 * @returns {string} the id of the updated/created document
 */
const baseUpdate = async (args, { req }, resourceType) => {
  logger.info(`${resourceType} >>> update`);
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  checkContentTypeHeader(req.headers);
  const data = req.body;
  checkSupportedResource(data.resourceType);
  //The user passes in an id in the request body and it doesn't match the id arg in the url
  //or user doesn't pass in body
  if (data.id !== args.id) {
    throw new BadRequestError('Argument id must match request body id for PUT request');
  }
  data['meta'] = {lastUpdated: getCurrentInstant(), ...data['meta']};
  if (req.headers['x-provenance']) {
    checkProvenanceHeader(req.headers);
    const res = req.res;
    populateProvenanceTarget(req.headers, res, [{ reference: `${resourceType}/${args.id}` }]);
  }
  return updateResource(args.id, data, resourceType);
};

/**
 * removes the document of the specified type with the specified id from the collection
 * @param {Object} args the args added to the end of the url, contains id of desired resource
 * @param {string} resourceType string which signifies which collection to add the data to
 * @returns {Object} an object containing deletedCount: the number of documents deleted
 */
const baseRemove = async (args, resourceType) => {
  logger.info(`${resourceType} >>> delete`);
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  return removeResource(args.id, resourceType);
};

/**
 * Build a basic service module for a given resource type. Supports basic CRUD operations.
 *
 * @param {string} resourceType Name of the resource to make a basic resource for.
 * @returns {Object} The resource service module.
 */
const buildServiceModule = resourceType => {
  return {
    create: async (_, data) => baseCreate(data, resourceType),
    searchById: async args => baseSearchById(args, resourceType),
    update: async (args, data) => baseUpdate(args, data, resourceType),
    remove: async args => baseRemove(args, resourceType),
    search: async (args, context) => baseSearch(args, context, resourceType)
  };
};

module.exports = {
  baseCreate,
  baseSearchById,
  baseUpdate,
  baseRemove,
  buildServiceModule,
  baseSearch
};
