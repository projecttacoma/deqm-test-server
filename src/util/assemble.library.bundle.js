/**
 *  start with a measure (this is basically a dependency tree)  (take the id in and query the database for the full
 * json contents of the measure)
 * find the base library (this where recursion starts)
 *  -this should return each of the child libraries, everything in the related artifacts array.
 *
 * split string on bar to get version and url (this can be used to check results of query)
 *
 *
 *  - create array of string of library references (cannonical urls)
 *  - when done uniquify
 *  - pass an empty aggregator array around? look at the find retrieves on how to add to an array and pass it around eventually just return
 *
 *
 *
 *
 *
 */

const { findResourceById, findResourcesWithFind } = require('./mongo.controller');

const createCollectionBundle = async measureId => {
  var measureJson = findResourceById(measureId, 'Measure');
  var rootLib = measureJson.library;
  var rootLibJson = null;
  //check if the library is a url or not
  if (isValidLibraryURL(rootLib)) {
    var libraryInfo = rootLib.split('|');
    var findQuery = { url: libraryInfo[0], version: libraryInfo[1] };
    rootLibJson = findResourcesWithFind(findQuery, 'Library');
  } else {
    rootLibJson = findResourceById(rootLib, 'Library');
  }
  var listOfLibraries = null;
  listOfLibraries.push(rootLibJson);
  listOfLibraries.push(findLibraries(rootLibJson, listOfLibraries));

  const cb = createCollectionBundle(measureId);
  listOfLibraries.forEach(param => {
    cb.addEntryFromResource(param.resource, 'Library');
  });
  return cb;
};

const findLibraries = async (libraryJson, listOfLibraries) => {
  //iterate through the related artifact
  if (libraryJson.relatedArtifact != null) {
    libraryJson.relatedArtifact.forEach(element => {
      if ((element.type = 'depends-on' && element.url.contains('Library'))) {
        //now query the db for this library and
        listOfLibraries.push(element.url);
        findLibraries(element.url, listOfLibraries);
      }
    });
  } else {
    var libraryInfo = rootLib.split('|');
    var findQuery = { url: libraryInfo[0], version: libraryInfo[1] };
    var libraryInfoFromDb = findResourcesWithFind(findQuery, 'Library');

    listOfLibraries.push(libraryInfoFromDb);
    return listOfLibraries;
  }
};

const isValidLibraryURL = async libraryName => {
  const urlFormat = /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;
  const r = new RegExp(urlFormat);
  return r.test(libraryName);
};

module.exports = { createCollectionBundle };
