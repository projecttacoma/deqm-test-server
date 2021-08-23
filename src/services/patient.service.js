const { baseCreate, baseSearchById, baseRemove, baseUpdate } = require('./base.service');

const create = async (args, { req }) => {
  return await baseCreate(req.body, 'Patient');
};
//send GET request to {BASE_URL}/4_0_0/patient/{id}
const searchById = async (args, { req }) => {
  return await baseSearchById(args.id, 'Patient');
};

//send DELETE request to {BASE_URL}/4_0_0/patient/{id}
const remove = async (args, { req }) => {
  return await baseRemove(args.id, 'Patient');
};

const update = async (args, { req }) => {
  return await baseUpdate(args.id, req.body, 'Patient');
};

module.exports = { create, searchById, remove, update };
