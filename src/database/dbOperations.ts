import { db } from './connection';
import logger from '../server/logger';
import { Document, Filter } from 'mongodb';
import { createManifestHash } from '../util/baseUtils';
import { BadRequestError } from '../util/errorUtils';

// Created from bulk export output manifest description:
// https://build.fhir.org/ig/HL7/bulk-data/export.html#response---output-manifest

export interface ExportManifest {
  transactionTime: string;
  request?: string;
  requiresAccessToken: boolean;
  outputOrganizedBy?: string;
  output: FileItem[];
  deleted?: FileItem[];
  error: FileItem[];
  link?: [{ relation: 'next'; url: string }];
  extension?: object;
}

export interface FileItem {
  url: string;
  extension?: object;
  type?: string; // may not be present when using organizeOutputBy
  continuesInFile?: string;
  count?: number;
}

export interface BulkImportStatus {
  id: string;
  clientId: string;
  status: 'In Progress' | 'Failed' | 'Completed';
  error: {
    code: number | null;
    message: string | null;
  };
  filesToExportCount: number;
  totalFileCount: number;
  resourcesToExportCount: number;
  totalResourceCount: number;
  failedOutcomes: string[];
  importManifest: ExportManifest;
  manifestUrl: string;
  baseUrl: string;
}

export interface BulkSubmissionStatus {
  id: string;
  status: string;
}

// Halts all further incoming requests and signals that all requests have been received (so that status responses can finish)
export async function updateSubmissionStatus(
  submitter: fhir4.Identifier,
  submissionId: string,
  code: 'complete' | 'aborted'
) {
  const id = `${submitter.value}-${submissionId}`;
  logger.debug(`Updating status to "${code}" for ${id}`);
  const collection = db.collection('bulkSubmissionStatuses');
  const update = {
    status: code
  };
  await collection.findOneAndUpdate({ id: id }, { $set: update }, { upsert: true });
}

// Gets existing submission status
export async function getBulkSubmissionStatus(
  submitterValue: string,
  submissionId: string
): Promise<BulkSubmissionStatus | undefined> {
  const id = `${submitterValue}-${submissionId}`;
  logger.debug(`Searching database for bulkSubmissionStatus ${id}`);
  const collection = db.collection('bulkSubmissionStatuses');
  return (await collection.findOne({ id: id })) as unknown as BulkSubmissionStatus;
}

// Create new bulk submission status
export async function createBulkSubmissionStatus(
  submitter: fhir4.Identifier,
  submissionId: string,
  submissionStatus?: fhir4.Coding
): Promise<BulkSubmissionStatus> {
  const data: BulkSubmissionStatus = {
    id: `${submitter.value}-${submissionId}`,
    status: submissionStatus?.code ?? 'in-progress'
  };
  const collection = db.collection('bulkSubmissionStatuses');
  logger.debug(`Inserting bulkSubmissionStatus ${data.id} into database`);
  await collection.insertOne(data as Document);
  return data;
}

/**
 * creates a new document in the specified collection
 * @param {Object} data the data of the document to be created
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Object} an object with the id of the created document
 */
export async function createResource(data: fhir4.FhirResource, resourceType: string) {
  const collection = db.collection(resourceType);
  logger.debug(`Inserting ${resourceType}/${data.id} into database`);
  await collection.insertOne(data as Document);
  return { id: data.id };
}

/**
 * searches the database for the desired resource and returns the data
 * @param {string} id id of desired resource
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Object} the data of the found document
 */
export async function findResourceById(id: string, resourceType: string) {
  const collection = db.collection(resourceType);
  logger.debug(`Searching database for ${resourceType}/${id}`);
  return collection.findOne({ id: id });
}

/**
 * searches the database for the one resource based on a mongo query and returns the data
 * @param {Object} query the mongo query to use
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Object} the data of the found document
 */
export async function findOneResourceWithQuery(query: Filter<Document>, resourceType: string) {
  const collection = db.collection(resourceType);
  logger.debug(`Searching database for one ${resourceType} which matches query: ${JSON.stringify(query)}`);
  return collection.findOne(query);
}

/**
 * searches the database for all resources based on the mongo query and returns the data
 * @param {Object} query the mongo query to use
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Promise<Array>} an array of found objects which match the input query
 */
export async function findResourcesWithQuery(query: Filter<Document>, resourceType: string) {
  const collection = db.collection(resourceType);
  logger.debug(`Searching database for all ${resourceType}s which match query: ${JSON.stringify(query)}`);
  return (await collection.find(query)).toArray();
}

/**
 * searches the database for all resources based on the mongo query and returns just the list of ids
 * @param {Object} query the mongo query to use
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Promise<Array<string>>} an array of found resource ids which match the input query
 */
export async function findResourceIdsWithQuery(query: Filter<Document>, resourceType: string) {
  const collection = db.collection(resourceType);
  logger.debug(`Searching database for all ${resourceType}s which match query: ${JSON.stringify(query)}`);
  return (await collection.find(query, { projection: { id: 1 } })).map(r => r.id).toArray();
}

/**
 * searches for a document and updates it if found, creates it if not
 * @param {string} id id of resource to be updated
 * @param {Object} data the updated data to add to/edit in the document
 * @param {string} resourceType the collection the document is in
 * @returns {string} the id of the updated/created document
 */
export async function updateResource(id: string, data: fhir4.FhirResource, resourceType: string) {
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
}

/**
 * searches for a document and updates it by pushing to existing
 * should not be called for document that doesn't exist or for data that doesn't already exist
 * @param {string} id id of resource to be updated
 * @param {Object} data the new data to push in the document
 * @param {string} resourceType the collection the document is in
 * @returns {string} the id of the updated/created document
 */
export async function pushToResource(id: string, data: fhir4.FhirResource, resourceType: string) {
  const collection = db.collection(resourceType);
  logger.debug(`Pushing data to ${resourceType}/${id} in database`);
  await collection.findOneAndUpdate({ id: id }, { $push: data as Document });
}

/**
 * searches the database for the desired resource and removes it from the db
 * @param {string} id id of resource to be removed
 * @param {string} resourceType type of desired resource, signifies collection resource is stored in
 * @returns {Object} an object containing deletedCount: the number of documents deleted
 */
export async function removeResource(id: string, resourceType: string) {
  const collection = db.collection(resourceType);
  logger.debug(`Removing ${resourceType}/${id} from database`);
  return collection.deleteOne({ id: id });
}

/**
 * Run an aggregation query on the database.
 * @param {Array} query Mongo aggregation pipeline array.
 * @param {string} resourceType The resource type (collection) to aggregate on.
 * @returns {Array} Array promise of results.
 */
export async function findResourcesWithAggregation(query: Document[], resourceType: string) {
  const collection = db.collection(resourceType);
  logger.debug(`Running aggregation query on ${resourceType}s with query: ${JSON.stringify(query)}`);
  return (await collection.aggregate(query)).toArray();
}

/**
 * Called as a result of bulkImport request. Adds a new clientId to db
 * which can be queried to get updates on the status of the bulk import
 * @returns {string} the id of the manifest-specific bulk status
 */
export async function addPendingBulkImportRequest(
  manifest: ExportManifest,
  clientId: string,
  manifestUrl: string,
  baseUrl: string
) {
  // Reproducible ID assigned for this manifest for the requesting client
  const manifestId = createManifestHash(clientId, manifestUrl);

  const collection = db.collection('bulkImportStatuses');

  const manifestMatches = (await collection.find({ id: manifestId }).toArray()).length;
  if (manifestMatches > 0) {
    throw new BadRequestError(
      `Found an existing match for the passed clientId ${clientId} and manifest url ${manifestUrl}`
    );
  }

  const bulkImportStatus: BulkImportStatus = {
    id: manifestId,
    clientId: clientId,
    status: 'In Progress',
    error: {
      code: null,
      message: null
    },
    // Counts for calculating percent of exported files/resources
    filesToExportCount: -1,
    totalFileCount: -1,
    resourcesToExportCount: -1,
    totalResourceCount: -1,
    failedOutcomes: [],
    importManifest: manifest,
    manifestUrl: manifestUrl,
    baseUrl: baseUrl
  };
  logger.debug(`Adding a bulkImportStatus for clientId ${clientId} with manifestId: ${manifestId}`);
  await collection.insertOne(bulkImportStatus);
  return manifestId;
}

/**
 * Updates the bulk import status entry for a successful import
 * @param {string} manifestId The ID for the bulkImportStatus entry
 */
export async function completeBulkImportRequest(manifestId: string) {
  const collection = db.collection('bulkImportStatuses');
  const update = {
    status: 'Completed'
  };
  logger.debug(`Completing bulkImportStatus for manifestId: ${manifestId}`);
  await collection.findOneAndUpdate({ id: manifestId }, { $set: update });
}

/**
 * Updates the bulk import status entry for a successful import
 * @param {string} manifestId The ID for the bulkImportStatus entry
 */
export async function failBulkImportRequest(manifestId: string, error: Error) {
  const collection = db.collection('bulkImportStatuses');
  const update = {
    status: 'Failed',
    error: {
      code: 500,
      message: error.message
    }
  };
  logger.debug(`Failing bulkImportStatus for manifestId: ${manifestId}`);
  await collection.findOneAndUpdate({ id: manifestId }, { $set: update });
}

/**
 * Pushes an array of error messages to a bulkstatus entry to later be converted to
 * OperationOutcomes and made accessible via ndjson file to requestor
 * @param {String} manifestId The id associated with the bulkImport request
 * @param {Array} failedOutcomes An array of strings with messages detailing why the resource failed import
 */
export async function pushBulkFailedOutcomes(manifestId: string, failedOutcomes: string[]) {
  const collection = db.collection('bulkImportStatuses');
  logger.debug(`Pushing failed outcomes to bulkImportStatus with manifestId: ${manifestId}`);
  await collection.findOneAndUpdate(
    { id: manifestId },
    { $push: { failedOutcomes: { $each: failedOutcomes } } as Document }
  );
}

/**
 * Pushes an array of error messages to a ndjson status entry to later be converted to
 * OperationOutcomes and made accessible via ndjson file to requestor
 * @param {String} manifestId The id associated with the bulkImport request
 * @param {String} fileUrl The url for the resource ndjson
 * @param {Array} failedOutcomes An array of strings with messages detailing why the resource failed import
 */
export async function pushNdjsonFailedOutcomes(
  manifestId: string,
  fileUrl: string,
  failedOutcomes: string[],
  successCount: number
) {
  const collection = db.collection('ndjsonStatuses');
  await collection.insertOne({
    id: manifestId + fileUrl,
    failedOutcomes: failedOutcomes,
    successCount: successCount
  });
  return manifestId;
}

/**
 * Wrapper for the findResourceById function that only searches ndjsonStatuses db
 * @param {string} manifestId The id signifying the bulk status request
 * @param {string} fileUrl The ndjson fileUrl
 * @returns {Object} The ndjson status entry for the passed in clientId and fileUrl
 */
export async function getNdjsonFileStatus(manifestId: string, fileUrl: string) {
  const status = await findResourceById(manifestId + fileUrl, 'ndjsonStatuses');
  return status;
}

/**
 * Searches bulkImportStatuses db for all import statuses associated with this submission clientId
 * @param {string} clientId The id signifying the submitter/submissionId for the bulk submission request
 * @returns {BulkImportStatus[]} All bulkstatus entries for the passed in clientId
 */
export async function getBulkImportStatuses(clientId: string): Promise<BulkImportStatus[]> {
  logger.debug(`Retrieving all bulkImportStatuses with clientId: ${clientId}`);
  // Find all bulkImportStatuses with matching clientId
  const collection = db.collection('bulkImportStatuses');
  return (await collection.find({ clientId: clientId }).toArray()) as unknown as BulkImportStatus[];
}

/**
 * Searches bulkImportStatuses db for a single import status associated with one manifest
 * @param {string} manifestId The id identifying a specific manifest for a submitter/submissionId
 * @returns {BulkImportStatus} Single matching status (or null if not found)
 */
export async function getBulkImportStatus(manifestId: string): Promise<BulkImportStatus | null> {
  const collection = db.collection('bulkImportStatuses');
  logger.debug(`Retrieving successCount for bulkImportStatus with manifestId: ${manifestId}`);
  const bulkStatus = await collection.findOne({ id: manifestId });
  return bulkStatus as unknown as BulkImportStatus | null;
}

/**
 * Sets the total number of files returned by the export flow to be parsed by the server
 * @param {string} manifestId The id signifying the bulk status request
 * @param {number} fileCount The number of output ndjson URLs returned by the export server
 */
export async function initializeBulkFileCount(manifestId: string, fileCount: number, resourceCount: number) {
  const collection = db.collection('bulkImportStatuses');
  logger.debug(`Initializing bulk file count for bulkImportStatus with manifestId: ${manifestId}`);
  await collection.findOneAndUpdate(
    { id: manifestId },
    // Set initial exported file/resource counts to their respective totals
    {
      $set: {
        filesToExportCount: fileCount,
        totalFileCount: fileCount,
        resourcesToExportCount: resourceCount,
        totalResourceCount: resourceCount,
        successCount: 0
      }
    }
  );
}

/**
 * Decrements the total number of files to process. Occurs after successful uploading of all of one ndjson file
 * @param {string} manifestId The id signifying the bulk status request
 * @param {number} resourceCount The number of resources to be subtracted from the exported resource count
 */
export async function decrementBulkFileCount(manifestId: string, resourceCount: number) {
  const collection = db.collection('bulkImportStatuses');
  let value;
  if (resourceCount !== -1) {
    // Update both the exported file count and exported resource count
    logger.debug(
      `Decrementing filesToExportCount and resourcesToExportCount for bulkImportStatus with manifestId: ${manifestId}`
    );
    value = (
      await collection.findOneAndUpdate(
        { id: manifestId },
        { $inc: { filesToExportCount: -1, resourcesToExportCount: -resourceCount } },
        { returnDocument: 'after', projection: { filesToExportCount: true, resourcesToExportCount: true, _id: 0 } }
      )
    ).value;
  } else {
    logger.debug(`Decrementing filesToExportCount for bulkImportStatus with manifestId: ${manifestId}`);

    value = (
      await collection.findOneAndUpdate(
        { id: manifestId },
        { $inc: { filesToExportCount: -1 } },
        { returnDocument: 'after', projection: { filesToExportCount: true, _id: 0 } }
      )
    ).value;
  }

  // Complete import request when file count reaches 0
  if (value?.filesToExportCount === 0) {
    logger.info(`Completed Import Request for: ${manifestId}`);
    await completeBulkImportRequest(manifestId);
  }
}

/**
 * Stores the total number of files successfully processed.
 * @param {string} manifestId The id signifying the bulk status request
 * @param {number} resourceCount The number of successfully imported resources
 */
export async function updateSuccessfulImportCount(manifestId: string, count: number) {
  const collection = db.collection('bulkImportStatuses');
  logger.debug(`Incrementing successCount by ${count} for bulkImportStatus with manifestId: ${manifestId}`);
  await collection.findOneAndUpdate(
    { id: manifestId },
    { $inc: { successCount: count } },
    { returnDocument: 'after', projection: { filesToExportCount: true, resourcesToExportCount: true, _id: 0 } }
  );
}

export async function getCurrentSuccessfulImportCount(manifestId: string) {
  const collection = db.collection('bulkImportStatuses');
  logger.debug(`Retrieving successCount for bulkImportStatus with manifestId: ${manifestId}`);
  const bulkStatus = await collection.findOne({ id: manifestId });
  return bulkStatus?.successCount;
}

/**
 * gets the number of documents in a specified collection
 * @param {string} resourceType specifies the name of the collection to be counted
 * @returns number that is the count of documents in the specified collection
 */
export async function getCountOfCollection(resourceType: string) {
  const collection = db.collection(resourceType);
  logger.debug('Retrieving count for specified collection');
  const count = await collection.countDocuments();
  return count;
}
