/**Let's write a utility that exports a function where, given an ID 
 * of a Measure resource, pulls that Measure resource and all FHIR Library
 *  resources that that measure depends on out from the database and into a collection Bundle. 
 * If any of the resources are missing, throw an Error. */
 const mongoUtil = require('../util/mongo');
 let getMeasure = (base_version) => {
    return resolveSchema(base_version, 'Measure');
  };
/**
 * searches the database for the desired resource and returns the data
 * @param {*} id id of relevant measure resource

 * @returns a bundle that contains the measure resource and all the needed fhir libraries
 */
 const assembleMeasureInfoBundle = async (id) => {
    const collection = db.collection(resourceType);
    let resultBundle;
    
  };