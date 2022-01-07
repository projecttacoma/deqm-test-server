// Sets up queue which processes the jobs pushed to Redis
// This queue is run in a child process when the server is started
const Queue = require('bee-queue');
const axios = require('axios');
const { updateResource } = require('../database/dbOperations');
const mongoUtil = require('../database/connection');

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
  console.log(`ndjson-worker-${process.pid}: processing`);
  const { fileUrl, clientId } = job.data;

  await mongoUtil.client.connect();
  const ndjsonResources = await retrieveNDJSONFromLocation(fileUrl);

  const insertions = ndjsonResources
    .trim()
    .split(/\n/)
    .map(async resourceStr => {
      const data = JSON.parse(resourceStr);
      return updateResource(data.id, data, data.resourceType);
    });

  await Promise.all(insertions);

  /* for (const line of ndjsonResources.trim().split(/\n/)) {
    const data = JSON.parse(line);
    await updateResource(data.id, data, data.resourceType);
  } */

  console.log(`ndjson-worker-${process.pid}: processed ${fileUrl.substring(fileUrl.lastIndexOf('/') + 1)}`);

  process.send(clientId);

  await mongoUtil.client.close();
});
