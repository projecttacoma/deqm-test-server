const { ResourceNotFoundError } = require('./errorUtils');
const _ = require('lodash');
const supportedResources = require('../server/supportedResources');
// lookup from patient compartment-definition
const patientRefs = require('../compartment-definition/patient-references');
const { findResourceById, findResourcesWithQuery, findOneResourceWithQuery } = require('../database/dbOperations');
const { mapResourcesToCollectionBundle, mapArrayToSearchSetBundle } = require('./bundleUtils');
const { getResourceReference } = require('./referenceUtils');
const logger = require('../server/logger');

/**
 * Wrapper function to get patient data and data
 * requirements for given patient id and map the resources to a collection bundle.
 * @param {string} patientReference reference to patient of interest (either of the form {PatientId} or Patient/{PatientId})
 * @param {Array} dataRequirements data requirements array obtained from fqm execution
 * @returns {Object} patient bundle as a collection bundle
 */
async function getPatientDataCollectionBundle(patientReference, dataRequirements) {
  // PatientReference can be of the form {PatientId} or Patient/{PatientId} this extracts just the PatientId in both cases
  const splitRef = patientReference.split('/');
  const patientId = splitRef[splitRef.length - 1];
  const data = await getPatientData(patientId, dataRequirements);
  return mapResourcesToCollectionBundle(_.flattenDeep(data));
}

/**
 * Wrapper function to get patient data for a given patient id and map
 * the resources to a searchset bundle (used for Patient/$everything when
 * we are not concerned with a specific measure)
 * @param {string} patientId patient ID of interest
 * @param {string} base_version base version from args passed in through client request
 * @param {string} host host specified in request headers
 * @returns {Object} patient bundle as a searchset bundle
 */
async function getPatientDataSearchSetBundle(patientId, base_version, host) {
  const data = await getPatientData(patientId);
  return mapArrayToSearchSetBundle(_.flattenDeep(data), base_version, host);
}

/**
 * Assemble the patient bundle to be used in our operations from fqm execution
 * @param {string} patientId patient ID of interest
 * @param {Array} dataRequirements data requirements array obtained from fqm execution,
 * used when we are concerned with a specific measure. Otherwise, undefined.
 * @returns {Array} array of resources
 */
async function getPatientData(patientId, dataRequirements) {
  const patient = await findResourceById(patientId, 'Patient');
  if (!patient) {
    throw new ResourceNotFoundError(`Patient with id ${patientId} does not exist in the server`);
  }
  let requiredTypes;
  if (dataRequirements) {
    logger.debug(`Filtering patient data using dataRequirements: ${JSON.stringify(dataRequirements)}`);
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
 * Takes in a care-gaps query and retrieves the ids of the patients to be run against the measure
 * NOTE: Currently, this function assumes ResourceType/ResourceId-style references
 * @param {string} subject A reference to either the FHIR Patient or Group resource to run against a measure
 * @param {string} organization A reference to a FHIR Organization. All patients which list the referenced organization
 * as their managingOrganization will be selected for gaps calculation run on them
 * @param {string} practitioner A reference to a FHIR Practitioner. All patients which list the referenced practitioner
 * as their generalPractitioner will be selected for gaps calculation run on them
 * @returns {Array} an array of patient ids
 */
const retrievePatientIds = async ({ subject, organization, practitioner }) => {
  let referencedObject;
  const reference = (subject || organization).split('/');
  if (reference[0] !== 'Patient') {
    referencedObject = await findResourceById(reference[1], reference[0]);
    if (!referencedObject) {
      throw new ResourceNotFoundError(`No resource found in collection: ${reference[0]}, with id: ${reference[1]}.`);
    }
  }

  if (reference[0] === 'Group') {
    return referencedObject.member.map(m => m.entity.reference.split('/')[1]);
  } else if (reference[0] === 'Patient') {
    return [subject.split('/')[1]];
  } else {
    if (practitioner) {
      const patients = await findResourcesWithQuery(
        {
          ...getResourceReference('generalPractitioner', practitioner),
          ...getResourceReference('managingOrganization', organization)
        },
        'Patient'
      );
      return patients.map(e => e.id);
    }
    const patients = await findResourcesWithQuery(
      getResourceReference('managingOrganization', organization),
      'Patient'
    );
    return patients.map(e => e.id);
  }
};

/**
 * Takes in a Group resource and practitioner from an evaluate-measure query and filters the
 * patients from the Group to those which reference the Practitioner resource
 * @param {Object} group A Group Resource
 * @param {string} practitioner A reference to a FHIR Practitioner. All patients which list the referenced practitioner
 * as their generalPractitioner will be selected for gaps calculation run on them
 * @returns array of patient IDs
 */
const filterPatientIdsFromGroup = async (group, practitioner) => {
  const patientPromises = group.member.map(async m => {
    const query = {
      id: m.entity.reference.split('/')[1],
      ...getResourceReference('generalPractitioner', practitioner)
    };

    return findOneResourceWithQuery(query, 'Patient');
  });
  const patients = (await Promise.all(patientPromises)).filter(a => a);
  return patients;
};

module.exports = {
  getPatientDataCollectionBundle,
  getPatientDataSearchSetBundle,
  getPatientData,
  retrievePatientIds,
  filterPatientIdsFromGroup
};
