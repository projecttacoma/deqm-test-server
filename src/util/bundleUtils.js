const { ServerError, resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const _ = require('lodash');
const url = require('url');
const { v4: uuidv4 } = require('uuid');
const { findResourceById, findOneResourceWithQuery, findResourcesWithQuery } = require('../database/dbOperations');
const supportedResources = require('../server/supportedResources');
// lookup from patient compartment-definition
const patientRefs = require('../compartment-definition/patient-references');

/**
 * Converts an array of FHIR resources to a fhir searchset bundle
 * @param {Array} resources and array of FHIR resources
 * @param {Object} args the arguments passed in through the client's request
 * @param {Object} req the request passed in by the client
 * @returns {Object} a FHIR searchset bundle containing the properly formatted resources
 */
function mapArrayToSearchSetBundle(resources, args, req) {
  const Bundle = resolveSchema(args.base_version, 'bundle');

  return new Bundle({
    type: 'searchset',
    meta: { lastUpdated: new Date().toISOString() },
    total: resources.length,
    entry: resources.map(r => {
      const DataType = resolveSchema(args.base_version, r.resourceType);
      return {
        fullUrl: new url.URL(`${r.resourceType}/${r.id}`, `http://${req.headers.host}/${args.base_version}/`),
        resource: new DataType(r)
      };
    })
  });
}

/**
 * Transform array of arbitrary resources into collection bundle
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
    throw new ServerError(null, {
      statusCode: 404,
      issue: [
        {
          severity: 'error',
          code: 'ResourceNotFound',
          details: {
            text: `Measure with id ${measureId} does not exist in the server`
          }
        }
      ]
    });
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
  const [mainLibraryRef] = measure.library;
  const mainLibQuery = getQueryFromReference(mainLibraryRef);
  const mainLib = await findOneResourceWithQuery(mainLibQuery, 'Library');

  if (!mainLib) {
    throw new ServerError(null, {
      statusCode: 500,
      issue: [
        {
          severity: 'error',
          code: 'internal',
          details: {
            text: `Could not find Library ${mainLibraryRef} referenced by Measure ${measure.id}`
          }
        }
      ]
    });
  }

  // TODO: Could we simplify the logic to avoid the need for de-duplication?
  const allLibsNested = await getAllDependentLibraries(mainLib);
  const allLibs = _(allLibsNested).flattenDeep().uniqBy('id').value();

  return mapResourcesToCollectionBundle([measure, ...allLibs]);
}

/**
 * Go through the relatedArtifact ValueSets and query for them from the database
 * @param {Object} lib FHIR library to grab ValueSets for
 * @returns {Array} list of ValueSet resources required by the library
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
    const libQuery = getQueryFromReference(url);
    const lib = await findOneResourceWithQuery(libQuery, 'Library');
    return getAllDependentLibraries(lib);
  });

  const allDeps = await Promise.all(libraryGets);

  results.push(...allDeps);

  return results;
}

/**
 * Wrapper function to get patient data for a given patient id and its data
 * requirements and map the resources to a collection bundle.
 * @param {string} patientId patient ID of interest
 * @param {Array} dataRequirements data requirements array obtained from fqm execution
 * @returns {Object} patient bundle as a collection bundle
 */
async function getPatientDataCollectionBundle(patientId, dataRequirements) {
  const data = await getPatientData(patientId, dataRequirements);
  return mapResourcesToCollectionBundle(_.flattenDeep(data));
}

/**
 * Wrapper function to get patient data for a given patient id and map
 * the resources to a searchset bundle (used for Patient/$everything when
 * we are not concerned with a specific measure)
 * @param {string} patientId patient ID of interest
 * @param {Object} args passed in arguments
 * @param {Object} req http request body
 * @returns {Object} patient bundle as a searchset bundle
 */
async function getPatientDataSearchSetBundle(patientId, args, req) {
  const data = await getPatientData(patientId);
  return mapArrayToSearchSetBundle(_.flattenDeep(data), args, req);
}

/**
 * Assemble the patient bundle to be used in our operations from fqm execution
 * @param {string} patientId patient ID of interest
 * @param {Array} dataRequirements data requirements array obtained from fqm execution,
 * used when we are concerned with a specific measure. Otherwise undefined
 * @returns {Array} array of resources
 */
async function getPatientData(patientId, dataRequirements) {
  const patient = await findResourceById(patientId, 'Patient');
  if (!patient) {
    throw new ServerError(null, {
      statusCode: 404,
      issue: [
        {
          severity: 'error',
          code: 'ResourceNotFound',
          details: {
            text: `Patient with id ${patientId} does not exist in the server`
          }
        }
      ]
    });
  }
  let requiredTypes;
  if (dataRequirements) {
    requiredTypes = _.uniq(dataRequirements.map(dr => dr.type));
  } else {
    requiredTypes = supportedResources.filter(type => patientRefs[type]);
  }
  const queries = requiredTypes.map(async type => {
    const allQueries = [];
    // for each resourceType, go through all keys that can reference patient
    patientRefs[type].forEach(refKey => {
      const query = {};
      query[`${refKey}.reference`] = `Patient/${patientId}`;
      allQueries.push(query);
    });
    return findResourcesWithQuery({ $or: allQueries }, type);
  });
  const data = await Promise.all(queries);
  data.push(patient);

  return data;
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
    //checking fullUrl and id in separate replace loops will prevent invalid ResourcType/ResourceID -> urn:uuid references
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
  getPatientDataCollectionBundle,
  getPatientDataSearchSetBundle,
  getPatientData,
  assembleCollectionBundleFromMeasure,
  getQueryFromReference
};
