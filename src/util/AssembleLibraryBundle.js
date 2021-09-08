/**Let's write a utility that exports a function where, given an ID 
 * of a Measure resource, pulls that Measure resource and all FHIR Library
 *  resources that that measure depends on out from the database and into a collection Bundle. 
 * If any of the resources are missing, throw an Error. */
 const mongoUtil = require('./mongo');
 class AssembleLibraryBundle {
  
  constructor() {
    this.entry = [];
  }
  getMeasure = (base_version) => {
    return findResourceById (id, "Measure")
  }

  getLibrary (id, resourceType)  {
    return findResourceById (id, "Library") ;
  }
/**
 * searches the database for the desired resource and returns the data
 * @param {*} id id of relevant measure resource

 * @returns a bundle that contains the measure resource and all the needed fhir libraries
 */
  assembleMeasureInfoBundle = async (measureId) => {
    //read library from measure bundle 
    //create stack of things to look up  start with depends on  under related artifacts ? 
    //once you have that stack just do a get by id on that list 
   var libs =  this.processMeasure(measureId);
    
   const newEntry = {
    resource: resource,
    request: {
      method: 'POST',
      url: resource.resourceType
    }
  };
  this.entry.push(newEntry);
}

processMeasure = (measureId) =>{
 var entries = measure.entries; //entries? or just list of related artifacts
  var listOfLibraries  = null; 
 
 for(var i =entries.length; i--; ){
  if(entries[i].resourceType = "Library") {
    listOfLibraries[i] = entries[i].id;
  }
 }
 return listOfLibraries
}

 
  toJSON() {
    return {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: this.entry
    };
  }
 
}
