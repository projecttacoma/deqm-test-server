// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
require('../config/envConfig');
const Queue = require('bee-queue');
const axios = require('axios');
const { updateResource, pushBulkFailedOutcomes } = require('../database/dbOperations');
const mongoUtil = require('../database/connection');
const { checkSupportedResource } = require('../util/baseUtils');
const logger = require('./logger');

const url = `mongodb://${process.env.DB_HOST}:${process.env.DB_PORT}`;

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

  await mongoUtil.Connection.connect(url);
  const ndjsonResources = await retrieveNDJSONFromLocation(fileUrl);

  const insertions = ndjsonResources
    .trim()
    .split(/\n/)
    .map(async resourceStr => {
      let data;
      try {
        data = JSON.parse(resourceStr);
      } catch (e) {
        throw new Error(`Error parsing JSON: ${resourceStr}`);
      }
      try {
        checkSupportedResource(data.resourceType);
        return updateResource(data.id, data, data.resourceType);
      } catch (e) {
        // Here, the location of the error message varies between standard error and ServerError
        // The former path finds the message for a ServerError, the latter for a standard error
        throw new Error(
          `${data.resourceType}/${data.id} failed import with the following message: ${
            e.issue?.[0]?.details?.text ?? e.message
          }`
        );
      }
    });

  const outcomes = await Promise.allSettled(insertions);

  const failedOutcomes = outcomes.filter(outcome => outcome.status === 'rejected');
  const succesfulOutcomes = outcomes.filter(outcome => outcome.status === 'fulfilled');

  const outcomeData = [];

  failedOutcomes.forEach(out => {
    outcomeData.push(out.reason.message);
  });
  await pushBulkFailedOutcomes(clientId, outcomeData);
  const successCount = succesfulOutcomes.length;
  logger.info(`ndjson-worker-${process.pid}: processed ${fileName}`);

  process.send({ clientId, resourceCount, successCount });

  await mongoUtil.Connection.connection.close();
});
