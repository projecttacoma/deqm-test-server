const { db } = require('./mongo');
const { v4: uuidv4 } = require('uuid');
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

const findResourcesWithQuery = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  return (await collection.find(query)).toArray();
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

  // If the document cannot be created with the passed id, Mongo will throw an error
  // before here, so should be ok to just return the passed id
  if (results.value === null) {
    // null value indicates a newly created document
    return { id: id, created: true };
  }

  // value being present indicates an update, so set created flag to false
  return { id: results.value.id, created: false };
};

/**
 * searches for a document and updates it by pushing to existing if found, creates it if not
 * @param {*} id id of resource to be updated
 * @param {*} data the new data to push in the document
 * @param {*} resourceType the collection the document is in
 * @returns the id of the updated/created document
 */
const pushToResource = async (id, data, resourceType) => {
  const collection = db.collection(resourceType);

  // TODO: multiple requires an $each i.e. data = { scores: { $each: [ 90, 92, 85 ] } }
  // should $each be passed in as data, or is that bad modularization?
  const results = await collection.findOneAndUpdate({ id: id }, { $push: data });

  // If the document cannot be created with the passed id, Mongo will throw an error
  // before here, so should be ok to just return the passed id
  if (results.value === null) {
    // null value indicates a newly created document
    return { id: id, created: true };
  }

  // value being present indicates an update, so set created flag to false
  return { id: results.value.id, created: false };
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

/**
 * Run an aggregation query on the database.
 * @param {*[]} query Mongo aggregation pipeline array.
 * @param {*} resourceType The resource type (collection) to aggregate on.
 * @returns Array promise of results.
 */
const findResourcesWithAggregation = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  return (await collection.aggregate(query)).toArray();
};

/**
 * Called as a result of bulkImport request. Adds a new clientId to db
 * which can be queried to get updates on the status of the bulk import
 * @returns the id of the inserted client
 */
const addPendingBulkImportRequest = async () => {
  const collection = db.collection('bulkImportStatuses');
  const clientId = uuidv4();
  const bulkImportClient = {
    id: clientId,
    status: 'In Progress',
    error: {
      code: null,
      message: null
    }
  };
  await collection.insertOne(bulkImportClient);
  return clientId;
};

/**
 * Updates the bulk import status entry for a successful import
 * @param {*} clientId The ID for the bulkImportStatus entry
 */
const completeBulkImportRequest = async clientId => {
  const collection = db.collection('bulkImportStatuses');
  const update = {
    status: 'Completed'
  };
  await collection.findOneAndUpdate({ id: clientId }, { $set: update });
};

/**
 * Updates the bulk import status entry for a successful import
 * @param {*} clientId The ID for the bulkImportStatus entry
 */
const failBulkImportRequest = async (clientId, error) => {
  const collection = db.collection('bulkImportStatuses');
  const update = {
    status: 'Failed',
    error: {
      code: 500,
      message: error.message
    }
  };
  await collection.findOneAndUpdate({ id: clientId }, { $set: update });
};

/**
 * Wrapper for the findResourceById function that only searches bulkImportStatuses db
 * @param {string} clientId The id signifying the bulk status request
 * @returns The bulkstatus entry for the passed in clientId
 */
const getBulkImportStatus = async clientId => {
  const status = await findResourceById(clientId, 'bulkImportStatuses');
  return status;
};

module.exports = {
  findResourcesWithQuery,
  findResourceById,
  findOneResourceWithQuery,
  createResource,
  removeResource,
  updateResource,
  pushToResource,
  findResourcesWithAggregation,
  addPendingBulkImportRequest,
  getBulkImportStatus,
  failBulkImportRequest,
  completeBulkImportRequest
};
