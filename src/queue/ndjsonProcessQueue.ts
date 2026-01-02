//@ts-nocheck
const Queue = require('bee-queue');

// Create a new queue to establish new Redis connection
const ndjsonQueue = new Queue('ndjson', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true,
  isWorker: false
});

ndjsonQueue.on('error', err => {
  console.log('ndjson queue error: ', err);
});

export = ndjsonQueue;
