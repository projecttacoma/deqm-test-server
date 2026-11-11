import Queue from 'bee-queue';
import { client } from '../database/connection';
import { executeCollectDataJob } from '../services/collectData/jobs';
import type { CollectDataJob } from '../services/collectData/types';
import logger from './logger';

const queue = new Queue<CollectDataJob>('collect-data', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 },
  removeOnSuccess: true,
  removeOnFailure: true
});
queue.on('error', (error: Error) => logger.error('collect-data worker error', error));

// The former handler's job lifecycle moved to services/collectData/jobs.ts;
// its collection sequence is shared with inline execution in services/collectData/run.ts.
queue.process(job => executeCollectDataJob(job.data));

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
