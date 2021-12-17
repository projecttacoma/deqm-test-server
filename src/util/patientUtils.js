const { ServerError } = require('@projecttacoma/node-fhir-server-core');
const _ = require('lodash');
const supportedResources = require('../server/supportedResources');
// lookup from patient compartment-definition
const patientRefs = require('../compartment-definition/patient-references');
const { findResourceById, findResourcesWithQuery } = require('../database/dbOperations');
const { mapResourcesToCollectionBundle, mapArrayToSearchSetBundle } = require('./bundleUtils');

/**
<<<<<<< HEAD
 * Wrapper function to get patient data and data
 * requirements for given patient id and map the resources to a collection bundle.
=======
 * Wrapper function to get patient data for a given patient id and its data
 * requirements and map the resources to a collection bundle.
>>>>>>> 75d7893 (created patientUtils from bundleUtils)
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
<<<<<<< HEAD
 * @param {string} base_version base version froma rgs passed in through client request
 * @param {string} host host specified in request headers
 * @returns {Object} patient bundle as a searchset bundle
 */
async function getPatientDataSearchSetBundle(patientId, base_version, host) {
  const data = await getPatientData(patientId);
  return mapArrayToSearchSetBundle(_.flattenDeep(data), base_version, host);
=======
 * @param {Object} args passed in arguments
 * @param {String} host host specified in request headers
 * @returns {Object} patient bundle as a searchset bundle
 */
async function getPatientDataSearchSetBundle(patientId, args, host) {
  const data = await getPatientData(patientId);
  return mapArrayToSearchSetBundle(_.flattenDeep(data), args, host);
>>>>>>> 75d7893 (created patientUtils from bundleUtils)
}

/**
 * Assemble the patient bundle to be used in our operations from fqm execution
 * @param {string} patientId patient ID of interest
 * @param {Array} dataRequirements data requirements array obtained from fqm execution,
<<<<<<< HEAD
 * used when we are concerned with a specific measure. Otherwise, undefined.
=======
 * used when we are concerned with a specific measure. Otherwise undefined
>>>>>>> 75d7893 (created patientUtils from bundleUtils)
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

module.exports = { getPatientDataCollectionBundle, getPatientDataSearchSetBundle, getPatientData };
