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

  // Library references could be canonical or resourceType/id
  let mainLib;
  if (isValidLibraryUrl(mainLibraryRef)) {
    mainLib = await findOneResourceWithQuery({ url: mainLibraryRef }, 'Library');
  } else {
    const mainLibraryId = mainLibraryRef.split('/')[1];
    mainLib = await findResourceById(mainLibraryId, 'Library');
  }

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

  const allLibsNested = await getAllDependentLibraries(mainLib);
  const allLibs = _(allLibsNested).flattenDeep().uniqBy('id').value();

  return mapResourcesToCollectionBundle([measure, ...allLibs]);
}

/**
 * Iterate through relatedArtifact of library and return list of all dependent libraries used
 * @param {Object} lib FHIR library resources to traverse dependencies from
 * @returns array of all libraries
 */
async function getAllDependentLibraries(lib) {
  const results = [lib];

  // If the library has no dependencies, we are done
  if (!lib.relatedArtifact || (Array.isArray(lib.relatedArtifact) && lib.relatedArtifact.length === 0)) {
    return results;
  }

  // This filter checks for the 'Library' keyword on all related artifacts
  // TODO: This filter can probably be improved, but will work in our cases for now
  const depLibUrls = lib.relatedArtifact
    .filter(ra => ra.type === 'depends-on' && ra.resource.includes('Library'))
    .map(ra => ra.resource);

  // Obtain all libraries referenced in the related artifact, and recurse on their dependencies
  const libraryGets = depLibUrls.map(async url => {
    const [urlPart, versionPart] = url.split('|');

    const lib = await findOneResourceWithQuery({ url: urlPart, version: versionPart }, 'Library');
    return getAllDependentLibraries(lib);
  });

  const allDeps = await Promise.all(libraryGets);

  results.push(...allDeps);

  return results;
}

module.exports = {
  getMeasureBundleFromId
};
