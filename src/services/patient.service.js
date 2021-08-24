const { baseCreate, baseSearchById, baseRemove, baseUpdate } = require('./base.service');

/**
 * resulting function of sending a POST request to {BASE_URL}/4_0_0/patient
 * creates a new patient in the database
 * @param {*} _ unused arg
 * @param {*} data the patient data passed in with the request
 * @returns an object with the created patient's id
 */
const create = async (_, data) => {
  return await baseCreate(data, 'Patient');
};

/**
 * result of sending a GET request to {BASE_URL}/4_0_0/patient/{id}
 * searches for the patient with the passed in id
 * @param {*} args passed in arguments including the id of the sought after patient
 * @returns
 */
const searchById = async args => {
  return await baseSearchById(args, 'Patient');
};

/**
 * result of sending a DELETE request to {BASE_URL}/4_0_0/patient/{id}
 * removes the patient with the passed in id from the database
 * @param {*} args passed in arguments including the id of the sought after patient
 * @returns
 */
const remove = async args => {
  return await baseRemove(args, 'Patient');
};

/**
 * result of sending a PUT request to {BASE_URL}/4_0_0/patient/{id}
 * updates the patient with the passed in id using the passed in data
 * @param {*} args passed in arguments including the id of the sought after patient
 * @param {*} data a map of the attributes to change and their new values
 * @returns
 */
const update = async (args, data) => {
  return await baseUpdate(args, data, 'Patient');
};

module.exports = { create, searchById, remove, update };
