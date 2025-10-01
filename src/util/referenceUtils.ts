//@ts-nocheck
const supportedResources = require('../server/supportedResources');

/**
 * Turn a property on FHIR resource of type Reference into a proper Mongo query
 *
 * @param {string} propName name of the FHIR resource property that is a Reference
 * @param {string} desiredValue the value of the Reference (either resourceType/id or identifier.value)
 * @return {Object} Mongo query digging into the proper reference
 */
const getResourceReference = (propName, desiredValue) => {
  let queryProp;
  if (desiredValue.includes('/')) {
    const [resourceType] = desiredValue.split('/');

    if (supportedResources.includes(resourceType)) {
      // ResourceType/ID reference, use .reference property
      queryProp = `${propName}.reference`;
    } else {
      queryProp = `${propName}.identifier.value`;
    }
  } else {
    // Default to identifier reference
    queryProp = `${propName}.identifier.value`;
  }

  return {
    [queryProp]: desiredValue
  };
};

module.exports = { getResourceReference };
