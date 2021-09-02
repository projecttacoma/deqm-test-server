const { ServerError, ServerResponse } = require('@asymmetrik/node-fhir-server-core');
const { baseCreate, baseSearchById, baseRemove, baseUpdate } = require('./base.service');

const { TransactionBundle } = require('../transactionBundle.js');
const { uploadTransactionBundle } = require('./bundle.service.js');
/**
 * resulting function of sending a POST request to {BASE_URL}/4_0_0/Measure
 * creates a new measure in the database
 * @param {*} _ unused arg
 * @param {*} data the measure data passed in with the request
 * @returns an object with the created measure's id
 */
const create = async (_, data) => {
  return baseCreate(data, 'Measure');
};

/**
 * result of sending a GET request to {BASE_URL}/4_0_0/Measure/{id}
 * searches for the measure with the passed in id
 * @param {*} args passed in arguments including the id of the sought after measure
 * @returns
 */
const searchById = async args => {
  return baseSearchById(args, 'Measure');
};

/**
 * result of sending a PUT request to {BASE_URL}/4_0_0/Measure/{id}
 * updates the measure with the passed in id using the passed in data
 * @param {*} args passed in arguments including the id of the sought after measure
 * @param {*} data a map of the attributes to change and their new values
 * @returns
 */
const update = async (args, data) => {
  return baseUpdate(args, data, 'Measure');
};

/**
 * result of sending a DELETE request to {BASE_URL}/4_0_0/Measure/{id}
 * removes the measure with the passed in id from the database
 * @param {*} args passed in arguments including the id of the sought after measure
 * @returns
 */
const remove = async args => {
  return baseRemove(args, 'Measure');
};

/**
 * takes a measureReport and a set of required data with which to calculate the measure and
 * creates new documents for the measureReport and requirements in the appropriate collections
 * @param {*} args the args object passed in by the user
 * @param {*} req the request object passed in by the user
 */
const submitData = async (args, { req }) => {
  //Create new transaction bundle
  const tb = new TransactionBundle();

  const resources = req.body.parameter;

  resources.forEach(res => {
    //TODOMAYBE: add functionality for if res is a bundle
    if (res.name === 'measureReport' && args.id) {
      res.resource.measure = `Measure/${args.id}`;
    }
    tb.addEntryFromResource(res.resource);
  });
  req.body = tb.toJSON();
  const output = await uploadTransactionBundle(req, req.res);
  console.log(output);
  //process transactionBundle
};

module.exports = { create, searchById, remove, update, submitData };
