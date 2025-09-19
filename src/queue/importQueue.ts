//@ts-nocheck 
// Setup for import queue which pushes jobs to Redis

const Queue = require('bee-queue');

// Create a new queue to establish new Redis connection
const importQueue = new Queue('import', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true,
  isWorker: false
});

importQueue.on('error', err => {
  console.log('queue error: ', err);
});

module.exports = importQueue;
