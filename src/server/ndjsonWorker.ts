//@ts-nocheck
// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const axios = require('axios');
const {
  updateResource,
  pushBulkFailedOutcomes,
  createNdjsonStatus,
  updateNdjsonFailedOutcomes,
  addNdjsonSuccessfulResource,
  deleteAllNdjsonSuccessfulResources
} = require('../database/dbOperations');
const mongoUtil = require('../database/connection');
const { checkSupportedResource } = require('../util/baseUtils');
import logger from './logger';
import { checkCancelled } from '../server/redisClient';

logger.info(`ndjson-worker-${process.pid}: ndjson Worker Started!`);
const ndjsonWorker = new Queue('ndjson', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

/**
 * Simple get and json handling of returned object
 * @param {string} url location of data
 * @returns {string} data retrieved
 */
const retrieveNDJSONFromLocation = async url => {
  const data = (await axios.get(url)).data;
  // If there is only one resource here, it comes out an object, not a string,
  // so force it to string here
  if (typeof data === 'object') {
    return JSON.stringify(data);
  }
  return data;
};

const rollBackInsertions = async (manifestId, fileUrl) => {
  await deleteAllNdjsonSuccessfulResources(manifestId, fileUrl);
};

// This handler pulls down the jobs on Redis to handle
ndjsonWorker.process(async job => {
  if (await checkCancelled(job.id)) {
    logger.warn('Ndjson job canceled before start');
    return;
  }
  const { fileUrl, clientId, resourceCount } = job.data;

  const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  logger.info(`ndjson-worker-${process.pid}: processing ${fileName}`);

  await mongoUtil.client.connect();

  let ndjsonResources;
  try {
    ndjsonResources = await retrieveNDJSONFromLocation(fileUrl);
  } catch (e) {
    const outcome = [`ndjson retrieval of ${fileUrl} failed with message: ${e.message}`];

    await createNdjsonStatus(clientId, fileUrl, outcome, job.id);
    await pushBulkFailedOutcomes(clientId, outcome);
    process.send({ clientId, resourceCount: 0, successCount: 0 });
    logger.info(`ndjson-worker-${process.pid}: failed to fetch ${fileName}`);
    return { clientId, resourceCount: 0, successCount: 0 };
  }

  await createNdjsonStatus(clientId, fileUrl, [], job.id);

  const ndjsonLines = ndjsonResources.split(/\n/);

  // keep track of when we hit the first non-empty line
  let firstNonEmptyLine = null;

  const insertions = [];
  for (let i = 0; i < ndjsonLines.length; i++) {
    let resourceStr = ndjsonLines[i];
    if (await checkCancelled(job.id)) {
      await rollBackInsertions(clientId, fileUrl);
      return;
    }
    resourceStr = resourceStr.trim();

    // if line is empty skip
    if (resourceStr === '') {
      insertions.push(null);
    }

    // if this is the first non empty line then mark that we found it
    if (firstNonEmptyLine === null) {
      firstNonEmptyLine = i;
    }

    // attempt to parse the line
    try {
      const data = JSON.parse(resourceStr);

      // check if first non empty line is a Parameters header and skip it
      if (firstNonEmptyLine === i && data.resourceType === 'Parameters') {
        insertions.push(null);
      }

      checkSupportedResource(data.resourceType);
      const updatedResourcePromise = await updateResource(data.id, data, data.resourceType);
      const updatedNdjsonPromise = await addNdjsonSuccessfulResource(clientId, fileUrl, data.resourceType, data.id);
      const [updatedResource] = await Promise.all([updatedResourcePromise, updatedNdjsonPromise]);

      insertions.push(updatedResource);
    } catch (e) {
      // Rethrow the error with info on the line number. This fails the async promise and will be collected later.
      throw new Error(`Failed to process entry at row ${i + 1}: ${e.issue?.[0]?.details?.text ?? e.message}`);
    }
  }

  const outcomes = await Promise.allSettled(insertions);

  const failedOutcomes = outcomes.filter(outcome => outcome.status === 'rejected');
  const successfulOutcomes = outcomes.filter(outcome => outcome.status === 'fulfilled' && outcome.value?.id);

  const outcomeData = [];

  failedOutcomes.forEach(out => {
    outcomeData.push(out.reason.message);
  });
  const successCount = successfulOutcomes.length;

  // keep track of failed outcomes for individual ndjson files
  await updateNdjsonFailedOutcomes(clientId, fileUrl, outcomeData, successCount);

  await pushBulkFailedOutcomes(clientId, outcomeData);

  logger.info(`ndjson-worker-${process.pid}: processed ${fileName}`);
  process.send({ clientId, resourceCount, successCount });

  await mongoUtil.client.close();
  return { clientId, resourceCount, successCount };
});

process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);

let stopping = false;
function exitHandler() {
  if (!stopping) {
    stopping = true;
    logger.info(`ndjson-worker-${process.pid}: ndjson Worker Stopping`);
    process.exit();
  }
}
