// Setup for import queue which pushes jobs to Redis

import Queue from 'bee-queue';

// Create a new queue to establish new Redis connection
export const deleteQueue = new Queue('delete', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true,
  isWorker: false
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
deleteQueue.on('error', (err: any) => {
  console.log('delete queue error: ', err);
});
