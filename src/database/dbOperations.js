const { v4: uuidv4 } = require('uuid');
const { db } = require('./connection.js');

/**
 * creates a new document in the specified collection
 * @param {Object} data the data of the document to be created
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Object} an object with the id of the created document
 */
const createResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  await collection.insertOne(data);
  return { id: data.id };
};

/**
 * searches the database for the desired resource and returns the data
 * @param {string} id id of desired resource
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Object} the data of the found document
 */
const findResourceById = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return collection.findOne({ id: id });
};

/**
 * searches the database for the one resource based on a mongo query and returns the data
 * @param {Object} query the mongo query to use
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Object} the data of the found document
 */
const findOneResourceWithQuery = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  return collection.findOne(query);
};

/**
 * searches the database for all resources based on the mongo query and returns the data
 * @param {Object} query the mongo query to use
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Array} an array of found objects which match the input query
 */
const findResourcesWithQuery = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  return (await collection.find(query)).toArray();
};

/**
 * searches for a document and updates it if found, creates it if not
 * @param {string} id id of resource to be updated
 * @param {Object} data the updated data to add to/edit in the document
 * @param {string} resourceType the collection the document is in
 * @returns {string} the id of the updated/created document
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
 * searches for a document and updates it by pushing to existing
 * should not be called for document that doesn't exist or for data that doesn't already exist
 * @param {string} id id of resource to be updated
 * @param {Object} data the new data to push in the document
 * @param {string} resourceType the collection the document is in
 * @returns {string} the id of the updated/created document
 */
const pushToResource = async (id, data, resourceType) => {
  const collection = db.collection(resourceType);
  await collection.findOneAndUpdate({ id: id }, { $push: data });
};

/**
 * searches the database for the desired resource and removes it from the db
 * @param {string} id id of resource to be removed
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Object} an object containing deletedCount: the number of documents deleted
 */
const removeResource = async (id, resourceType) => {
  const collection = db.collection(resourceType);
  return collection.deleteOne({ id: id });
};

/**
 * Run an aggregation query on the database.
 * @param {Array} query Mongo aggregation pipeline array.
 * @param {string} resourceType The resource type (collection) to aggregate on.
 * @returns {Array} Array promise of results.
 */
const findResourcesWithAggregation = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  return (await collection.aggregate(query)).toArray();
};

/**
 * Called as a result of bulkImport request. Adds a new clientId to db
 * which can be queried to get updates on the status of the bulk import
 * @returns {string} the id of the inserted client
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
    },
    // Counts for calculating percent of exported files/resources
    exportedFileCount: -1,
    totalFileCount: -1,
    exportedResourceCount: -1,
    totalResourceCount: -1,
    failedOutcomes: []
  };
  await collection.insertOne(bulkImportClient);
  return clientId;
};

/**
 * Updates the bulk import status entry for a successful import
 * @param {string} clientId The ID for the bulkImportStatus entry
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
 * @param {string} clientId The ID for the bulkImportStatus entry
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
 * Pushes an array of error messages to a bulkstatus entry to late be converted to
 * OperationOutcomes and made accessible via ndjson file to requestor
 * @param {String} clientId The id associated with the bulkImport request
 * @param {Array} failedOutcomes An array of strings with messages detailing why the resource failed import
 */
const pushBulkFailedOutcomes = async (clientId, failedOutcomes) => {
  const collection = db.collection('bulkImportStatuses');
  await collection.findOneAndUpdate({ id: clientId }, { $push: failedOutcomes });
};

/**
 * Wrapper for the findResourceById function that only searches bulkImportStatuses db
 * @param {string} clientId The id signifying the bulk status request
 * @returns {Object} The bulkstatus entry for the passed in clientId
 */
const getBulkImportStatus = async clientId => {
  const status = await findResourceById(clientId, 'bulkImportStatuses');
  return status;
};

/**
 * Sets the total number of files returned by the export flow to be parsed by the server
 * @param {string} clientId The id signifying the bulk status request
 * @param {number} fileCount The number of output ndjson URLs returned by the export server
 */
const initializeBulkFileCount = async (clientId, fileCount, resourceCount) => {
  const collection = db.collection('bulkImportStatuses');
  await collection.findOneAndUpdate(
    { id: clientId },
    // Set initial exported file/resource counts to their respective totals
    {
      $set: {
        exportedFileCount: fileCount,
        totalFileCount: fileCount,
        exportedResourceCount: resourceCount,
        totalResourceCount: resourceCount
      }
    }
  );
};

/**
 * Decrements the total number of files to process. Occurs after successful uploading of all of one ndjson file
 * @param {string} clientId The id signifying the bulk status request
 * @param {number} resourceCount The number of resources to be subtracted from the exported resource count
 */
const decrementBulkFileCount = async (clientId, resourceCount) => {
  const collection = db.collection('bulkImportStatuses');
  let value;
  if (resourceCount !== -1) {
    // Update both the exported file count and exported resource count
    value = (
      await collection.findOneAndUpdate(
        { id: clientId },
        { $inc: { exportedFileCount: -1, exportedResourceCount: -resourceCount } },
        { returnDocument: 'after', projection: { exportedFileCount: true, exportedResourceCount: true, _id: 0 } }
      )
    ).value;
  } else {
    value = (
      await collection.findOneAndUpdate(
        { id: clientId },
        { $inc: { exportedFileCount: -1 } },
        { returnDocument: 'after', projection: { exportedFileCount: true, _id: 0 } }
      )
    ).value;
  }

  // Complete import request when file count reaches 0
  if (value.exportedFileCount === 0) {
    await completeBulkImportRequest(clientId);
  }
};

module.exports = {
  addPendingBulkImportRequest,
  completeBulkImportRequest,
  createResource,
  decrementBulkFileCount,
  failBulkImportRequest,
  pushBulkFailedOutcomes,
  findOneResourceWithQuery,
  findResourceById,
  findResourcesWithAggregation,
  findResourcesWithQuery,
  getBulkImportStatus,
  initializeBulkFileCount,
  pushToResource,
  removeResource,
  updateResource
};
