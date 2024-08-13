const { v4: uuidv4 } = require('uuid');
const { db } = require('./connection.js');

const logger = require('../server/logger');

/**
 * creates a new document in the specified collection
 * @param {Object} data the data of the document to be created
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Object} an object with the id of the created document
 */
const createResource = async (data, resourceType) => {
  const collection = db.collection(resourceType);
  logger.debug(`Inserting ${resourceType}/${data.id} into database`);
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
  logger.debug(`Searching database for ${resourceType}/${id}`);
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
  logger.debug(`Searching database for one ${resourceType} which matches query: ${JSON.stringify(query)}`);
  return collection.findOne(query);
};

/**
 * searches the database for all resources based on the mongo query and returns the data
 * @param {Object} query the mongo query to use
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Promise<Array>} an array of found objects which match the input query
 */
const findResourcesWithQuery = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  logger.debug(`Searching database for all ${resourceType}s which match query: ${JSON.stringify(query)}`);
  return (await collection.find(query)).toArray();
};

/**
 * searches the database for all resources based on the mongo query and returns just the list of ids
 * @param {Object} query the mongo query to use
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Promise<Array<string>>} an array of found resource ids which match the input query
 */
const findResourceIdsWithQuery = async (query, resourceType) => {
  const collection = db.collection(resourceType);
  logger.debug(`Searching database for all ${resourceType}s which match query: ${JSON.stringify(query)}`);
  return (await collection.find(query, { projection: { id: 1 } })).map(r => r.id).toArray();
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
  logger.debug(`Finding and updating ${resourceType}/${data.id} in database`);

  const results = await collection.replaceOne({ id }, data, { upsert: true });

  // If the document cannot be created with the passed id, Mongo will throw an error
  // before here, so should be ok to just return the passed id
  // upsertedCount indicates that we have created a brand new document
  if (results.upsertedCount === 1) {
    return { id, created: true };
  }

  // value being present indicates an update, so set created flag to false
  return { id, created: false };
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
  logger.debug(`Pushing data to ${resourceType}/${id} in database`);
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
  logger.debug(`Removing ${resourceType}/${id} from database`);
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
  logger.debug(`Running aggregation query on ${resourceType}s with query: ${JSON.stringify(query)}`);
  return (await collection.aggregate(query)).toArray();
};

/**
 * Called as a result of bulkImport request. Adds a new clientId to db
 * which can be queried to get updates on the status of the bulk import
 * @returns {string} the id of the inserted client
 */
const addPendingBulkImportRequest = async body => {
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
    failedOutcomes: [],
    importManifest: body
  };
  logger.debug(`Adding a bulkImportStatus for clientId: ${clientId}`);
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
  logger.debug(`Completing bulkImportStatus for clientId: ${clientId}`);
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
  logger.debug(`Failing bulkImportStatus for clientId: ${clientId}`);
  await collection.findOneAndUpdate({ id: clientId }, { $set: update });
};

/**
 * Pushes an array of error messages to a bulkstatus entry to later be converted to
 * OperationOutcomes and made accessible via ndjson file to requestor
 * @param {String} clientId The id associated with the bulkImport request
 * @param {Array} failedOutcomes An array of strings with messages detailing why the resource failed import
 */
const pushBulkFailedOutcomes = async (clientId, failedOutcomes) => {
  const collection = db.collection('bulkImportStatuses');
  logger.debug(`Pushing failed outcomes to bulkImportStatus with clientId: ${clientId}`);
  await collection.findOneAndUpdate({ id: clientId }, { $push: { failedOutcomes: { $each: failedOutcomes } } });
};

/**
 * Pushes an array of error messages to a ndjson status entry to later be converted to
 * OperationOutcomes and made accessible via ndjson file to requestor
 * @param {String} clientId The id associated with the bulkImport request
 * @param {String} fileUrl The url for the resource ndjson
 * @param {Array} failedOutcomes An array of strings with messages detailing why the resource failed import
 */
const pushNdjsonFailedOutcomes = async (clientId, fileUrl, failedOutcomes, successCount) => {
  const collection = db.collection('ndjsonStatuses');
  await collection.insertOne({
    id: clientId + fileUrl,
    failedOutcomes: failedOutcomes,
    successCount: successCount
  });
  return clientId;
};

/**
 * Wrapper for the findResourceById function that only searches ndjsonStatuses db
 * @param {string} clientId The id signifying the bulk status request
 * @param {string} fileUrl The ndjson fileUrl
 * @returns {Object} The ndjson status entry for the passed in clientId and fileUrl
 */
const getNdjsonFileStatus = async (clientId, fileUrl) => {
  const status = await findResourceById(clientId + fileUrl, 'ndjsonStatuses');
  return status;
};

/**
 * Wrapper for the findResourceById function that only searches bulkImportStatuses db
 * @param {string} clientId The id signifying the bulk status request
 * @returns {Object} The bulkstatus entry for the passed in clientId
 */
const getBulkImportStatus = async clientId => {
  logger.debug(`Retrieving bulkImportStatus with clientId: ${clientId}`);
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
  logger.debug(`Initializing bulk file count for bulkImportStatus with clientId: ${clientId}`);
  await collection.findOneAndUpdate(
    { id: clientId },
    // Set initial exported file/resource counts to their respective totals
    {
      $set: {
        exportedFileCount: fileCount,
        totalFileCount: fileCount,
        exportedResourceCount: resourceCount,
        totalResourceCount: resourceCount,
        successCount: 0
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
    logger.debug(
      `Decrementing exportedFileCount and exportedResourceCount for bulkImportStatus with clientId: ${clientId}`
    );
    value = (
      await collection.findOneAndUpdate(
        { id: clientId },
        { $inc: { exportedFileCount: -1, exportedResourceCount: -resourceCount } },
        { returnDocument: 'after', projection: { exportedFileCount: true, exportedResourceCount: true, _id: 0 } }
      )
    ).value;
  } else {
    logger.debug(`Decrementing exportedFileCount for bulkImportStatus with clientId: ${clientId}`);

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
/**
 * Stores the total number of files successfully processed.
 * @param {string} clientId The id signifying the bulk status request
 * @param {number} resourceCount The number of successfully imported resources
 */
const updateSuccessfulImportCount = async (clientId, count) => {
  const collection = db.collection('bulkImportStatuses');
  logger.debug(`Incrementing successCount by ${count} for bulkImportStatus with clientId: ${clientId}`);
  await collection.findOneAndUpdate(
    { id: clientId },
    { $inc: { successCount: count } },
    { returnDocument: 'after', projection: { exportedFileCount: true, exportedResourceCount: true, _id: 0 } }
  );
};
const getCurrentSuccessfulImportCount = async clientId => {
  const collection = db.collection('bulkImportStatuses');
  logger.debug(`Retrieving successCount for bulkImportStatus with clientId: ${clientId}`);
  const bulkStatus = await collection.findOne({ id: clientId });
  return bulkStatus.successCount;
};

/**
 * gets the number of documents in a specified collection
 * @param {string} resourceType specifies the name of the collection to be counted
 * @returns number that is the count of documents in the specified collection
 */
const getCountOfCollection = async resourceType => {
  const collection = db.collection(resourceType);
  logger.debug('Retrieving count for specified collection');
  const count = await collection.countDocuments();
  return count;
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
  findResourceIdsWithQuery,
  getBulkImportStatus,
  getCurrentSuccessfulImportCount,
  initializeBulkFileCount,
  pushToResource,
  removeResource,
  updateResource,
  updateSuccessfulImportCount,
  getCountOfCollection,
  pushNdjsonFailedOutcomes,
  getNdjsonFileStatus
};
