const { findResourceById, createResource, removeResource, updateResource } = require('../util/mongo.controller');
const { v4: uuidv4 } = require('uuid');
/**
 *
 * @param {*} req the
 * @param {*} resourceType string which dsignifies which collection to add the data to
 * @returns
 */
const baseCreate = async ({ req }, resourceType) => {
  //if and id is not specified, we can make one
  const data = req.body;
  if (!data.id) {
    data.id = uuidv4();
  }
  data['_id'] = data.id;
  return createResource(data, resourceType);
};

/**
 *
 * @param {*} args the args added to the end of the url, contains id of desired resource
 * @param {*} resourceType string which dsignifies which collection to add the data to
 * @returns
 */
const baseSearchById = async (args, resourceType) => {
  return findResourceById(args.id, resourceType);
};

/**
 * @param {*} args the args added to the end of the url, contains id of desired resource
 * @param {*} req the
 * @param {*} resourceType string which dsignifies which collection to add the data to
 * @returns
 */
const baseUpdate = async (args, { req }, resourceType) => {
  return updateResource(args.id, req.body, resourceType);
};

/**
 * @param {*} args the args added to the end of the url, contains id of desired resource
 * @param {*} req the
 * @param {*} resourceType string which dsignifies which collection to add the data to
 * @returns
 */
const baseRemove = async (args, resourceType) => {
  return removeResource(args.id, resourceType);
};
module.exports = { baseCreate, baseSearchById, baseUpdate, baseRemove };
