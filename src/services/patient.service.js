const { loggers } = require('@projecttacoma/node-fhir-server-core');
const { baseCreate, baseSearchById, baseRemove, baseUpdate, baseSearch } = require('./base.service');
const { getPatientDataBundle } = require('../util/bundleUtils');
const { findResourcesWithQuery } = require('../util/mongo.controller');
const logger = loggers.get('default');

/**
 * resulting function of sending a POST request to {BASE_URL}/4_0_1/Patient
 * creates a new patient in the database
 * @param {*} _ unused arg
 * @param {*} data the measure data passed in with the request
 * @returns an object with the created measure's id
 */
const create = async (_, data) => {
  return baseCreate(data, 'Patient');
};

/**
 * result of sending a GET request to {BASE_URL}/4_0_1/Patient/{id}
 * searches for the patient with the passed in id
 * @param {*} args passed in arguments including the id of the sought after patient
 * @returns
 */
const searchById = async args => {
  return baseSearchById(args, 'Patient');
};

/**
 * result of sending a PUT request to {BASE_URL}/4_0_1/Patient/{id}
 * updates the patient with the passed in id using the passed in data
 * @param {*} args passed in arguments including the id of the sought after patient
 * @param {*} data a map of the attributes to change and their new values
 * @returns
 */
const update = async (args, data) => {
  return baseUpdate(args, data, 'Patient');
};

/**
 * result of sending a DELETE request to {BASE_URL}/4_0_1/Patient/{id}
 * removes the measure with the passed in id from the database
 * @param {*} args passed in arguments including the id of the sought after patient
 * @returns
 */
const remove = async args => {
  return baseRemove(args, 'Patient');
};

/**
 * result of sending a GET request to {BASE_URL}/4_0_1/Patient
 * queries for all measures matching the criteria, only name and version for now
 * @param {Object} args passed in arguments including the search parameters for the Patient
 * @param {Object} req http request object
 * @returns
 */
const search = async (args, { req }) => {
  logger.info('Patient >>> search');
  return baseSearch(args, { req }, 'Patient');
};

/**
 * Result of sending a GET request to {BASE_URL}/4_0_1/Patient/$everything
 * Returns all information related to patient specified, or all
 * patients in db (if no id is specified)
 * @param {Object} args passed in arguments
 * @param {Object} req http request object
 */
const patientEverything = async (args, { req }) => {
  if (req.params.id) {
    // return information for specified patient
    const patientBundle = await getPatientDataBundle(req.params.id);
    return patientBundle;
  } else {
    // return information for all patients
    const patients = await findResourcesWithQuery({}, 'Patient');
    let patientBundles = patients.map(async p => {
      return getPatientDataBundle(p.id);
    });

    patientBundles = await Promise.all(patientBundles);
    // want to create into a searchset bundle?
    return patientBundles;
  }
};

module.exports = {
  create,
  searchById,
  remove,
  update,
  search,
  patientEverything
};
