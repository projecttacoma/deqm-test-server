// Setup for import queue which pushes jobs to Redis

import Queue from 'bee-queue';

// Create a new queue to establish new Redis connection
export const importQueue = new Queue('import', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true,
  isWorker: false
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
importQueue.on('error', (err: any) => {
  console.log('queue error: ', err);
});
