// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const axios = require('axios');
const { updateResource, pushBulkFailedOutcomes, pushNdjsonFailedOutcomes } = require('../database/dbOperations');
const mongoUtil = require('../database/connection');
const { checkSupportedResource } = require('../util/baseUtils');
const logger = require('./logger');

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

// This handler pulls down the jobs on Redis to handle
ndjsonWorker.process(async job => {
  const { fileUrl, clientId, resourceCount } = job.data;

  const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  logger.info(`ndjson-worker-${process.pid}: processing ${fileName}`);

  await mongoUtil.client.connect();

  let ndjsonResources;
  try {
    ndjsonResources = await retrieveNDJSONFromLocation(fileUrl);
  } catch (e) {
    const outcome = [`ndjson retrieval of ${fileUrl} failed with message: ${e.message}`];

    await pushNdjsonFailedOutcomes(clientId, fileUrl, outcome);
    await pushBulkFailedOutcomes(clientId, outcome);
    process.send({ clientId, resourceCount: 0, successCount: 0 });
    logger.info(`ndjson-worker-${process.pid}: failed to fetch ${fileName}`);
    return;
  }

  const ndjsonLines = ndjsonResources.trim().split(/\n/);
  if (ndjsonLines.length > 0 && JSON.parse(ndjsonLines[0]).resourceType === 'Parameters') {
    // check first line for a Parameters header and remove if necessary
    ndjsonLines.shift();
  }

  const insertions = ndjsonLines.map(async (resourceStr, index) => {
    let data;
    try {
      index++;
      data = JSON.parse(resourceStr);
      checkSupportedResource(data.resourceType);
      return updateResource(data.id, data, data.resourceType);
    } catch (e) {
      throw new Error(`Failed to process entry at row ${index}: ${e.issue?.[0]?.details?.text ?? e.message}`);
    }
  });

  const outcomes = await Promise.allSettled(insertions);

  const failedOutcomes = outcomes.filter(outcome => outcome.status === 'rejected');
  const successfulOutcomes = outcomes.filter(outcome => outcome.status === 'fulfilled');

  const outcomeData = [];

  failedOutcomes.forEach(out => {
    outcomeData.push(out.reason.message);
  });
  const successCount = successfulOutcomes.length;

  // keep track of failed outcomes for individual ndjson files
  await pushNdjsonFailedOutcomes(clientId, fileUrl, outcomeData, successCount);

  await pushBulkFailedOutcomes(clientId, outcomeData);

  logger.info(`ndjson-worker-${process.pid}: processed ${fileName}`);
  process.send({ clientId, resourceCount, successCount });

  await mongoUtil.client.close();
});
