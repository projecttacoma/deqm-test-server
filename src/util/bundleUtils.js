const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { ResourceNotFoundError, InternalError } = require('./errorUtils');
const _ = require('lodash');
const url = require('url');
const { v4: uuidv4 } = require('uuid');
const { findResourceById, findOneResourceWithQuery } = require('../database/dbOperations');
const logger = require('../server/logger');

/*
 Some connectathon bundles currently contain incorrect url references from the main library
 to its dependent libraries. This map identifies those issues and provides the correct url reference
*/
const INCORRECT_CONNECTATHON_URLS_MAP = {
  'http://hl7.org/fhir/Library/SupplementalDataElements|2.0.0':
    'http://fhir.org/guides/dbcg/connectathon/Library/SupplementalDataElements|2.0.0',
  'http://hl7.org/fhir/Library/TJCOverall|5.0.000':
    'http://fhir.org/guides/dbcg/connectathon/Library/TJCOverall|5.0.000',
  'http://hl7.org/fhir/Library/VTEICU|5.0.000': 'http://fhir.org/guides/dbcg/connectathon/Library/VTEICU|5.0.000',
  'http://hl7.org/fhir/Library/Hospice|2.0.000': 'http://fhir.org/guides/dbcg/connectathon/Library/Hospice|2.0.000',
  'http://hl7.org/fhir/Library/AdultOutpatientEncounters|2.0.000':
    'http://fhir.org/guides/dbcg/connectathon/Library/AdultOutpatientEncounters|2.0.000'
};

/**
 * Converts an array of FHIR resources to a FHIR searchset bundle
 * @param {Array} resources an array of FHIR resources
 * @param {string} base_version base version from args passed in through client request
 * @param {string} host host specified in request headers
 * @returns {Object} a FHIR searchset bundle containing the properly formatted resources
 */
function mapArrayToSearchSetBundle(resources, base_version, host) {
  const Bundle = resolveSchema(base_version, 'bundle');

  return new Bundle({
    type: 'searchset',
    meta: { lastUpdated: new Date().toISOString() },
    total: resources.length,
    entry: resources.map(r => {
      const DataType = resolveSchema(base_version, r.resourceType);
      return {
        fullUrl: new url.URL(`${r.resourceType}/${r.id}`, `http://${host}/${base_version}/`),
        resource: new DataType(r)
      };
    })
  });
}

/**
 * Transforms array of arbitrary resources into collection bundle
 * @param {Array} resources an array of FHIR resources to map
 * @returns {Object} FHIR collection bundle of all resources
 */
function mapResourcesToCollectionBundle(resources) {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: resources.map(r => ({
      resource: r
    }))
  };
}

/**
 * Utility function for checking if a given string is a canonical URL
 * @param {string} s the string to check
 * @returns {boolean} true if the string is a url, false otherwise
 */
function isCanonicalUrl(s) {
  const urlRegex = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;
  return urlRegex.test(s);
}

/**
 * Utility function for checking if a library has any dependencies
 * @param {Object} lib FHIR Library resource to check dependencies of
 * @returns {boolean} true if there are any other Library/ValueSet resources that this library depends on, false otherwise
 */
function hasNoDependencies(lib) {
  return !lib.relatedArtifact || (Array.isArray(lib.relatedArtifact) && lib.relatedArtifact.length === 0);
}

/**
 * Assemble a mongo query based on a reference to another resource
 * @param {string} reference either a canonical or resourceType/id reference
 * @returns {Object} mongo query to pass in to mongo controller to search for the referenced resource
 */
function getQueryFromReference(reference) {
  // References could be canonical or resourceType/id
  if (isCanonicalUrl(reference)) {
    if (reference.includes('|')) {
      const [urlPart, versionPart] = reference.split('|');
      return { url: urlPart, version: versionPart };
    } else {
      return { url: reference };
    }
  } else {
    const id = reference.split('/')[1];
    return { id };
  }
}

/**
 * Assemble a measure bundle with necessary FHIR Library resources
 * @param {string} measureId id of the measure to assemble bundle for
 * @returns {Object} FHIR Bundle of Measure resource and all dependent FHIR Library resources
 */
async function getMeasureBundleFromId(measureId) {
  const measure = await findResourceById(measureId, 'Measure');
  if (!measure) {
    throw new ResourceNotFoundError(`Measure with id ${measureId} does not exist in the server`);
  }
  return assembleCollectionBundleFromMeasure(measure);
}

/**
 * Takes in a measure resource, finds all dependent library resources and bundles them
 * together with the measure in a collection bundle
 * @param {Object} measure a fhir measure resource
 * @returns {Object} FHIR Bundle of Measure resource and all dependent FHIR Library resources
 */
async function assembleCollectionBundleFromMeasure(measure) {
  logger.info(`Assembling collection bundle from Measure ${measure.id}`);
  const [mainLibraryRef] = measure.library;
  const mainLibQuery = getQueryFromReference(mainLibraryRef);
  const mainLib = await findOneResourceWithQuery(mainLibQuery, 'Library');

  if (!mainLib) {
    throw new InternalError(`Could not find Library ${mainLibraryRef} referenced by Measure ${measure.id}`);
  }

  // TODO: Could we simplify the logic to avoid the need for de-duplication?
  const allLibsNested = await getAllDependentLibraries(mainLib);
  const allLibs = _(allLibsNested).flattenDeep().uniqBy('id').value();

  return mapResourcesToCollectionBundle([measure, ...allLibs]);
}

/**
 * Go through the relatedArtifact ValueSets and query for them from the database
 * @param {Object} lib FHIR library to grab ValueSets for
 * @returns {Array} array of ValueSet resources required by the library
 */
async function getDependentValueSets(lib) {
  if (hasNoDependencies(lib)) {
    return [];
  }

  const depValueSetUrls = lib.relatedArtifact
    .filter(ra => ra.type === 'depends-on' && ra.resource.includes('ValueSet'))
    .map(ra => ra.resource);

  const valueSetGets = depValueSetUrls.map(async url => {
    const vsQuery = getQueryFromReference(url);
    return findOneResourceWithQuery(vsQuery, 'ValueSet');
  });

  return Promise.all(valueSetGets);
}

/**
 * Iterate through relatedArtifact of library and return list of all dependent libraries used
 * @param {Object} lib FHIR library resources to traverse dependencies from
 * @returns {Array} array of all libraries
 */
async function getAllDependentLibraries(lib) {
  logger.debug(`Retrieving all dependent libraries for library: ${lib.id}`);

  // Kick off function with current library and any ValueSets it uses
  const valueSets = await getDependentValueSets(lib);
  const results = [lib, ...valueSets];

  // If the library has no dependencies, we are done
  if (hasNoDependencies(lib)) {
    return results;
  }

  // This filter checks for the 'Library' keyword on all related artifacts
  // TODO: This filter can probably be improved, but will work in our cases for now
  const depLibUrls = lib.relatedArtifact
    .filter(ra => ra.type === 'depends-on' && ra.resource.includes('Library'))
    .map(ra => ra.resource);
  // Obtain all libraries referenced in the related artifact, and recurse on their dependencies
  const libraryGets = depLibUrls.map(async url => {
    // Quick fix for invalid connectathon url references
    if (url in INCORRECT_CONNECTATHON_URLS_MAP) {
      logger.warn(
        `Using potentially outdated reference url: ${url}. Replacing with ${INCORRECT_CONNECTATHON_URLS_MAP[url]}`
      );
      url = INCORRECT_CONNECTATHON_URLS_MAP[url];
    }
    const libQuery = getQueryFromReference(url);
    const lib = await findOneResourceWithQuery(libQuery, 'Library');
    if (lib === null) {
      throw new InternalError(
        `Failed to find dependent library with ${
          libQuery.id ? `id: ${libQuery.id}` : `canonical url: ${libQuery.url}`
        }${libQuery.version ? ` and version: ${libQuery.version}` : ''}`
      );
    }
    return getAllDependentLibraries(lib);
  });

  const allDeps = await Promise.all(libraryGets);

  results.push(...allDeps);

  return results;
}

/**
 * For entries in a transaction bundle whose IDs will be auto-generated, replace all instances of an existing reference
 * to the old id with a reference to the newly generated one.
 *
 * Modify the request type to PUT after forcing the IDs. This will not affect return results, just internal representation
 *
 * @param {Array} entries array of bundle entries
 * @returns {Array} new array of entries with replaced references
 */
function replaceReferences(entries) {
  // Add metadata for old IDs and newly created ones of POST entries
  entries.forEach(e => {
    logger.debug(`Replacing resourceIds for entry: ${JSON.stringify(e)}`);
    if (e.request.method === 'POST') {
      e.isPost = true;
      e.oldId = e.resource.id;
      e.newId = uuidv4();
    }
  });

  let entriesStr = JSON.stringify(entries);
  const postEntries = entries.filter(e => e.isPost);

  // For each POST entry, replace existing reference across all entries
  postEntries.forEach(e => {
    logger.debug(`Replacing referenceIds for entry: ${JSON.stringify(e)}`);
    // Checking fullUrl and id in separate replace loops will prevent invalid ResourceType/ResourceID -> urn:uuid references
    if (e.oldId) {
      const idRegexp = new RegExp(`${e.resource.resourceType}/${e.oldId}`, 'g');
      entriesStr = entriesStr.replace(idRegexp, `${e.resource.resourceType}/${e.newId}`);
    }
    if (e.fullUrl) {
      const urnRegexp = new RegExp(e.fullUrl, 'g');
      entriesStr = entriesStr.replace(urnRegexp, `${e.resource.resourceType}/${e.newId}`);
    }
  });

  // Remove metadata and modify request type/resource id
  const newEntries = JSON.parse(entriesStr).map(e => {
    if (e.isPost) {
      logger.debug(`Removing metadata and changing request type to PUT for entry: ${JSON.stringify(e)}`);
      e.resource.id = e.newId;
      e.request = {
        method: 'PUT',
        url: `${e.resource.resourceType}/${e.newId}`
      };
    }

    return { resource: e.resource, request: e.request };
  });

  return newEntries;
}

module.exports = {
  mapArrayToSearchSetBundle,
  getMeasureBundleFromId,
  replaceReferences,
  assembleCollectionBundleFromMeasure,
  getQueryFromReference,
  mapResourcesToCollectionBundle,
  getAllDependentLibraries
};
