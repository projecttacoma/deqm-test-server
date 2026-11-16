import Queue from 'bee-queue';
import { client } from '../database/connection';
import logger from './logger';
import { executeCollectDataJob } from '../operations/collectData';

const queue = new Queue('collect-data', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 },
  removeOnSuccess: true,
  removeOnFailure: true
});
queue.on('error', (error: Error) => logger.error('collect-data worker error', error));

queue.process(job => {
  executeCollectDataJob(job.data);
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  try {
    await queue.close(1000);
    await client.close();
  } finally {
    process.exit();
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
