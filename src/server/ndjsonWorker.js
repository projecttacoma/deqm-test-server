// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const axios = require('axios');
const { updateResource, pushBulkFailedOutcomes } = require('../database/dbOperations');
const mongoUtil = require('../database/connection');
const { checkSupportedResource } = require('../util/baseUtils');

console.log(`ndjson-worker-${process.pid}: ndjson Worker Started!`);
const ndjsonWorker = new Queue('ndjson', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

const retrieveNDJSONFromLocation = async url => {
  const data = (await axios.get(url)).data;
  // If there is only one resource here, it comes out an object, not a string,
  // so I force it to string here
  if (typeof data === 'object') {
    return JSON.stringify(data);
  }
  return data;
};

// This handler pulls down the jobs on Redis to handle
ndjsonWorker.process(async job => {
  const { fileUrl, clientId, resourceCount } = job.data;

  const fileName = fileUrl.substring(fileUrl.lastIndexOf('/') + 1);
  console.log(`ndjson-worker-${process.pid}: processing ${fileName}`);

  await mongoUtil.client.connect();
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
  const outcomeData = [];

  failedOutcomes.forEach(out => {
    outcomeData.push(out.reason.message);
  });
  await pushBulkFailedOutcomes(clientId, outcomeData);

  console.log(`ndjson-worker-${process.pid}: processed ${fileName}`);

  process.send({ clientId, resourceCount });

  await mongoUtil.client.close();
});
