const { db } = require('./mongo');

/**
 * creates a new document in the specified collection
 * @param {*} data the data of the document to be created
 * @param {*} resourceType type of desired resource, signifies collection resource is stored in
 * @returns an object with the id of the created document
 */
const createResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  await collection.insertOne(data);
  return { id: data.id };
};

/**
 * searches the database for the desired resource and returns the data
 * @param {*} id id of desired resource
 * @param {*} resourceType type of desired resource, signifies collection resource is stored in
 * @returns the data of the found document
 */
const findResourceById = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return collection.findOne({ id: id });
};

/**
 * searches the database for the one resource based on a mongo query and returns the data
 * @param {Object} query the mongo query to use
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns the data of the found document
 */
const findOneResourceWithQuery = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  return collection.findOne(query);
};

/**
 * searches for a document and updates it if found, creates it if not
 * @param {*} id id of resource to be updated
 * @param {*} data the updated data to add to/edit in the document
 * @param {*} resourceType the collection the document is in
 * @returns the id of the updated/created document
 */
const updateResource = async (id, data, resourceType) => {
  const collection = db.collection(resourceType);

  const results = await collection.findOneAndUpdate({ id: id }, { $set: data }, { upsert: true });

  //If the document cannot be created with the passed id, Mongo will throw an error
  //before here, so should be ok to just return the passed id
  if (results.value === null) {
    return { id: id };
  }
  return { id: results.value.id };
};

/**
 * searches the database for the desired resource and removes it from the db
 * @param {*} id id of resource to be removed
 * @param {*} resourceType type of desired resource, signifies collection resource is stored in
 * @returns an object containing deletedCount: the number of documents deleted
 */
const removeResource = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return collection.deleteOne({ id: id });
};

module.exports = { findResourceById, findOneResourceWithQuery, createResource, removeResource, updateResource };
