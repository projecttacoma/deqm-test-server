import Queue from 'bee-queue';
import '../config/envConfig';
import logger from '../server/logger';
import type { CollectDataJob } from '../services/collectData/types';

export const collectDataQueue = new Queue<CollectDataJob>('collect-data', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 },
  removeOnSuccess: true,
  isWorker: false
});
collectDataQueue.on('error', (error: Error) => logger.error('collect-data queue error', error));
