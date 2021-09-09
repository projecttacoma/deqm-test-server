/**Let's write a utility that exports a function where, given an ID
 * of a Measure resource, pulls that Measure resource and all FHIR Library
 *  resources that that measure depends on out from the database and into a collection Bundle.
 * If any of the resources are missing, throw an Error. */
const mongoUtil = require('./mongo');
import { findClauseInLibrary } from 'ELMHelpers';
class AssembleLibraryBundle {
  constructor() {
    this.entry = [];
  }
  getMeasure(id, resourceType) {
    return findResourceById(id, 'Measure');
  }

  getLibrary(id, resourceType) {
    return findResourceById(id, 'Library');
  }
  /**
 * searches the database for the desired resource and returns the data
 * @param {*} id id of relevant measure resource

 * @returns a bundle that contains the measure resource and all the needed fhir libraries
 */
  assembleMeasureInfoBundle(measureId) {
    var libs = this.processMeasure(measureId);
    var totalListOfLibraries;
    var bundleOfLibs;
    while (libs.length != 0) {
      //check if this library is referencing the any other libraries if not add this library to a list
      //similar to what is done in elmhelpers.ts
      var library = libs.pop().id;
      totalListOfLibraries.push(library);
      //if it's referencing other libraries add those to the initial list
    }
    for (var i = libs.length; i--; ) {
      bundleOfLibs.push(totalListOfLibraries[i].toJSON());
    }
    return bundleOfLibs;
  }

  processMeasure(measureId) {
    var entries;
    var measure = this.getMeasure(measureId);
    measure.array.forEach(element => {
      //if the resourceType is libary or the resource contains Libary in the name?
      if ((element.resourceType = 'Library'))
        // || element.relatedArtifact.resource)
        entries.push(element);
    });

    var listOfLibraries = null;

    for (var i = entries.length; i--; ) {
      if ((entries[i].resourceType = 'Library')) {
        listOfLibraries[i] = entries[i].id;
      }
    }
    return listOfLibraries;
  }

  toJSON() {
    return {
      resourceType: 'Library',
      type: 'transaction',
      entry: this.entry
    };
  }
}
