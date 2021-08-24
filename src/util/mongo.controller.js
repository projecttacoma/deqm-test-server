const { db } = require('./mongo');

/**
 * searches the database for the desired resource and returns the data
 * @param {*} id id of desired resource
 * @param {*} resourceType type of desired resource, signifies collection resource is stored in
 * @returns
 */
const findResourceById = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return await collection.findOne({ id: id });
};

/**
 *
 * @param {*} data the data to store in
 * @param {*} resourceType type of desired resource, signifies collection resource is stored in
 * @returns
 */
const createResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  const results = await collection.insertOne(data);
  return { id: results.insertedId };
};

/**
 * searches the database for the desired resource and removes it from the db
 * @param {*} id id of resource to be removed
 * @param {*} resourceType type of desired resource, signifies collection resource is stored in
 * @returns
 */
const removeResource = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return await collection.deleteOne({ id: id });
};

const updateResource = async (id, data, resourceType) => {
  const collection = db.collection(resourceType);
  const results = await collection.findOneAndUpdate({ id: id }, { $set: data }, { upsert: true });
  return {
    id: results.value.id
  };
};

module.exports = { findResourceById, createResource, removeResource, updateResource };
