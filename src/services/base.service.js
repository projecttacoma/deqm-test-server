const { v4: uuidv4 } = require('uuid');
const { resolveSchema, ServerError } = require('@asymmetrik/node-fhir-server-core');
const {
  findResourceById,
  createResource,
  removeResource,
  updateResource,
  findResourcesWithAggregation
} = require('../util/mongo.controller');
const QueryBuilder = require('@asymmetrik/fhir-qb');
const url = require('url');

const globalParameterDefinitions = {
  _content: {
    type: 'string',
    fhirtype: 'string',
    xpath: '',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-content',
    description: 'Search on the entire content of the resource',
    modifier: 'missing,exact,contains'
  },
  _id: {
    type: 'token',
    fhirtype: 'token',
    xpath: 'Resource.id',
    definition: 'http://hl7.org/fhir/SearchParameter/Resource-id',
    description: 'Logical id of this artifact',
    modifier: 'missing,text,not,in,not-in,below,above,ofType'
  }
};

const qb = new QueryBuilder({
  globalParameterDefinitions,
  implementationParameters: { archivedParamPath: '_isArchived' }
});

/**
 * creates an object and generates an id for it regardless of the id passed in
 * @param {*} req an object containing the request body
 * @param {*} resourceType string which signifies which collection to add the data to
 * @returns the id of the created object
 */
const baseCreate = async ({ req }, resourceType) => {
  checkHeaders(req.headers);
  const data = req.body;
  //Create a new id regardless of whether one is passed
  data['id'] = uuidv4();

  return createResource(data, resourceType);
};

/**
 * Searches for the object of the requested type with the requested id
 * @param {*} args the args added to the end of the url, contains id of desired resource
 * @param {*} resourceType string which signifies which collection to search for
 * the data and which FHIR type to cast the result to
 * @returns the object with the desired id cast to the requested type
 */
const baseSearchById = async (args, resourceType) => {
  const dataType = resolveSchema(args.base_version, resourceType.toLowerCase());
  const result = await findResourceById(args.id, resourceType);
  if (!result) {
    throw new ServerError(null, {
      statusCode: 404,
      issue: [
        {
          severity: 'error',
          code: 'ResourceNotFound',
          details: {
            text: `No resource found in collection: ${resourceType}, with: id ${args.id}`
          }
        }
      ]
    });
  }
  return new dataType(result);
};

const baseSearch = async (args, context, resourceType) => {
  // grab the schemas for the data type and Bundle to use for response
  const dataType = resolveSchema(args.base_version, resourceType.toLowerCase());
  const Bundle = resolveSchema(args.base_version, 'bundle');

  // wipe out params since the 'base_version' here breaks the query building
  context.req.params = {};
  context.includeArchived = true;

  // build the aggregation query
  const filter = qb.buildSearchQuery({ req: context.req, includeArchived: true });
  console.log(JSON.stringify(filter));

  // grab the results from aggregation. has metadata about counts and data with resources
  const results = (await (await findResourcesWithAggregation(filter.query, resourceType)).toArray())[0];

  // create instances of each of the resulting resources
  const resultEntries = results.data.map(result => {
    return {
      fullUrl: new url.URL(
        `${result.resourceType}/${result.id}`,
        `http://${context.req.headers.host}/${args.base_version}/`
      ),
      resource: new dataType(result)
    };
  });

  // build result bundle
  const searchBundle = new Bundle({
    type: 'searchset',
    meta: { lastUpdated: new Date().toISOString() },
    total: results.metadata[0].total,
    entry: resultEntries
  });
  return searchBundle;
};

/**
 * updates the document of the specified resource type with the passed in id or creates a new
 * document if no document with passed id is found
 * @param {*} args the args added to the end of the url, contains id of desired resource
 * @param {*} req an object containing the request body
 * @param {*} resourceType string which signifies which collection to add the data to
 * @returns the id of the updated/created document
 */
const baseUpdate = async (args, { req }, resourceType) => {
  checkHeaders(req.headers);
  const data = req.body;
  //The user passes in an id in the request body and it doesn't match the id arg in the url
  //or user doesn't pass in body
  if (data.id !== args.id) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: 'Argument id must match request body id for PUT request'
          }
        }
      ]
    });
  }

  return updateResource(args.id, data, resourceType);
};

/**
 * removes the document of the specified type with the specified id from the collection
 * @param {*} args the args added to the end of the url, contains id of desired resource
 * @param {*} resourceType string which signifies which collection to add the data to
 * @returns an object containing deletedCount: the number of documents deleted
 */
const baseRemove = async (args, resourceType) => {
  return removeResource(args.id, resourceType);
};

/**
 * checks if the headers are incorrect and throws and error with guidance if so
 * @param {*} requestHeaders the headers from the request body
 */
const checkHeaders = requestHeaders => {
  if (
    requestHeaders['content-type'] !== 'application/json+fhir' &&
    requestHeaders['content-type'] !== 'application/fhir+json'
  ) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: 'Ensure Content-Type is set to application/json+fhir or to application/fhir+json in headers'
          }
        }
      ]
    });
  }
};

/**
 * Build a basic service module for a given resource type. Supports basic CRUD operations.
 *
 * @param {string} resourceType Name of the resource to make a basic resource for.
 * @returns The resource service module.
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

module.exports = { baseCreate, baseSearchById, baseUpdate, baseRemove, buildServiceModule };
