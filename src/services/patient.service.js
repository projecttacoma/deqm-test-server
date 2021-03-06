const _ = require('lodash');
const { NotImplementedError } = require('../util/errorUtils');
const { baseCreate, baseSearchById, baseRemove, baseUpdate, baseSearch } = require('./base.service');
const { mapArrayToSearchSetBundle } = require('../util/bundleUtils');
const { getPatientData, getPatientDataSearchSetBundle } = require('../util/patientUtils');
const { findResourcesWithQuery } = require('../database/dbOperations');
const logger = require('../server/logger');

/**
 * resulting function of sending a POST request to {BASE_URL}/4_0_1/Patient
 * creates a new patient in the database
 * @param {undefined} _ unused arg
 * @param {Object} data the measure data passed in with the request
 * @returns an object with the created measure's id
 */
const create = async (_, data) => {
  return baseCreate(data, 'Patient');
};

/**
 * result of sending a GET request to {BASE_URL}/4_0_1/Patient/{id}
 * searches for the patient with the passed in id
 * @param {Object} args passed in arguments including the id of the sought after patient
 * @returns {Object} the object with the desired id cast to Patient
 */
const searchById = async args => {
  return baseSearchById(args, 'Patient');
};

/**
 * result of sending a PUT request to {BASE_URL}/4_0_1/Patient/{id}
 * updates the patient with the passed in id using the passed in data
 * @param {Object} args passed in arguments including the id of the sought after patient
 * @param {Object} data a map of the attributes to change and their new values
 * @returns {string} the id of the created/updated patient
 */
const update = async (args, data) => {
  return baseUpdate(args, data, 'Patient');
};

/**
 * result of sending a DELETE request to {BASE_URL}/4_0_1/Patient/{id}
 * removes the measure with the passed in id from the database
 * @param {Object} args passed in arguments including the id of the sought after patient
 * @returns {Object} an object containing the number of items deleted
 */
const remove = async args => {
  return baseRemove(args, 'Patient');
};

/**
 * result of sending a GET request to {BASE_URL}/4_0_1/Patient
 * queries for all measures matching the criteria, only name and version for now
 * @param {Object} args passed in arguments including the search parameters for the Patient
 * @param {Object} req http request object
 * @returns {Object} Search set result bundle
 */
const search = async (args, { req }) => {
  return baseSearch(args, { req }, 'Patient');
};

/**
 * Result of sending a GET request to {BASE_URL}/4_0_1/Patient/$everything
 * Returns all information related to patient specified, or all
 * patients in db (if no id is specified)
 * @param {Object} args passed in arguments
 * @param {Object} req http request object
 * @returns {Object} a FHIR searchset bundle containing the properly formatted resources
 */
const patientEverything = async (args, { req }) => {
  logger.info('Patient >>> $everything');
  logger.debug(`Request args: ${JSON.stringify(args)}`);
  logger.debug(`Request headers: ${JSON.stringify(req.header)}`);

  validatePatientEverythingParams(req);
  if (req.params.id) {
    // return information for specified patient
    const patientBundle = await getPatientDataSearchSetBundle(req.params.id, args.base_version, req.headers.host);
    return patientBundle;
  } else {
    // return information for all patients
    const patients = await findResourcesWithQuery({}, 'Patient');
    let patientData = patients.map(async p => {
      return getPatientData(p.id);
    });

    patientData = await Promise.all(patientData);
    return mapArrayToSearchSetBundle(_.flattenDeep(patientData), args.base_version, req.headers.host);
  }
};

/**
 * Checks if unsupported parameters are provided in the http request.
 * If any unsupported parameters are present, a NotImplemented error is thrown.
 * @param {Object} req http request object
 */
const validatePatientEverythingParams = req => {
  // These params are not supported. We should throw an error if we receive them
  const UNSUPPORTED_PARAMS = ['start', 'end', '_since', '_type', '_count'];

  // Returns a list of all unsupported params which are present
  const presentUnsupportedParams = UNSUPPORTED_PARAMS.filter(key => req.query[key]);

  if (presentUnsupportedParams.length > 0) {
    throw new NotImplementedError(
      `$everything functionality has not yet been implemented for requests with parameters: ${presentUnsupportedParams.join(
        ', '
      )}`
    );
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
