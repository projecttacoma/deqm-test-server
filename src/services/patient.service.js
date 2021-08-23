const { baseCreate, baseSearchById, baseRemove, baseUpdate } = require('./base.service');

//send POST request to {BASE_URL}/4_0_0/patient
//body of request will include data to push to patient
const create = async (_, data) => {
  return await baseCreate(data, 'Patient');
};
//send GET request to {BASE_URL}/4_0_0/patient/{id}
const searchById = async args => {
  return await baseSearchById(args, 'Patient');
};

//send DELETE request to {BASE_URL}/4_0_0/patient/{id}
const remove = async args => {
  return await baseRemove(args, 'Patient');
};

//send PUT request to {BASE_URL}/4_0_0/patient/{id}
//body of request will contain update to specified patient
const update = async (args, data) => {
  return await baseUpdate(args, data, 'Patient');
};

module.exports = { create, searchById, remove, update };
