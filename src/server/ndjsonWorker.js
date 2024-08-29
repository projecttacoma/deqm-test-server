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
    return { clientId, resourceCount: 0, successCount: 0 };
  }

  const ndjsonLines = ndjsonResources.split(/\n/);

  // keep track of when we hit the first non-empty line
  let hitNonEmpty = false;

  const insertions = ndjsonLines.map(async (resourceStr, index) => {
    resourceStr = resourceStr.trim();

    // if line is empty skip
    if (resourceStr === '') {
      return null;
    }

    // attempt to parse the line
    try {
      // capture the value of if we already hit a non empty line incase we can parse this resource
      const wasNotEmptyHit = hitNonEmpty;
      // set this to true now that we have reached a non empty line
      hitNonEmpty = true;

      const data = JSON.parse(resourceStr);

      // check if first non empty line is a Parameters header and skip it
      if (!wasNotEmptyHit && data.resourceType === 'Parameters') {
        return null;
      }

      checkSupportedResource(data.resourceType);
      return updateResource(data.id, data, data.resourceType);
    } catch (e) {
      // Rethrow the error with info on the line number. This fails the async promise and will be collected later.
      throw new Error(`Failed to process entry at row ${index + 1}: ${e.issue?.[0]?.details?.text ?? e.message}`);
    }
  });

  const outcomes = await Promise.allSettled(insertions);

  const failedOutcomes = outcomes.filter(outcome => outcome.status === 'rejected');
  const successfulOutcomes = outcomes.filter(outcome => outcome.status === 'fulfilled' && outcome.value?.id);

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
