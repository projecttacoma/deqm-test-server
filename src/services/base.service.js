const { findResourceById, createResource, removeResource, updateResource } = require('../util/mongo.controller');

const baseCreate = async (data, resourceType) => {
  return await createResource(data, resourceType);
};
const baseSearchById = async (id, resourceType) => {
  return await findResourceById(id, resourceType);
};
const baseUpdate = async (id, data, resourceType) => {
  return await updateResource(id, data, resourceType);
};
const baseRemove = async (id, resourceType) => {
  return await removeResource(id, resourceType);
};
module.exports = { baseCreate, baseSearchById, baseUpdate, baseRemove };
