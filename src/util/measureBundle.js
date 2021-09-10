const { ServerError } = require('@asymmetrik/node-fhir-server-core');
const _ = require('lodash');
const { findResourceById, findOneResourceWithQuery } = require('../util/mongo.controller');

function mapResourcesToCollectionBundle(resources) {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: resources.map(r => ({
      resource: r
    }))
  };
}

function isValidLibraryUrl(s) {
  const urlRegex = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-/]))?/;
  return urlRegex.test(s);
}

function hasNoDependencies(lib) {
  return !lib.relatedArtifact || (Array.isArray(lib.relatedArtifact) && lib.relatedArtifact.length === 0);
}

function getQueryFromReference(reference) {
  // Library references could be canonical or resourceType/id
  if (isValidLibraryUrl(reference)) {
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
 * @returns FHIR Bundle of Measure resource and all dependent FHIR Library resources
 */
async function getMeasureBundleFromId(measureId) {
  const measure = await findResourceById(measureId, 'Measure');

  if (!measure) {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'internal',
          details: {
            text: `Measure with id ${measureId} does not exist in the server`
          }
        }
      ]
    });
  }

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
            text: `Could not find Library ${mainLibraryRef} referenced by Measure ${measureId}`
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
 * @returns list of ValueSet resources required by the library
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
 * @returns array of all libraries
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

module.exports = {
  getMeasureBundleFromId
};
