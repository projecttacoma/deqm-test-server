const { findResourceById, createResource, removeResource, updateResource } = require('../util/mongo.controller');

const baseCreate = async ({ req }, resourceType) => {
  return await createResource(req.body, resourceType);
};
const baseSearchById = async (args, resourceType) => {
  return await findResourceById(args.id, resourceType);
};
const baseUpdate = async (args, { req }, resourceType) => {
  return await updateResource(args.id, req.body, resourceType);
};
const baseRemove = async (args, resourceType) => {
  return await removeResource(args.id, resourceType);
};
module.exports = { baseCreate, baseSearchById, baseUpdate, baseRemove };
