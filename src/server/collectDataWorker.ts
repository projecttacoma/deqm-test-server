import Queue from 'bee-queue';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { client } from '../database/connection';
import {
  CollectDataQuery,
  startCollectDataRequest,
  saveCollectDataQueries,
  completeCollectDataQuery,
  failCollectDataQuery,
  completeCollectDataRequest,
  failCollectDataRequest
} from '../database/dbOperations';
import type { PreparedCollectData } from '../util/measureUtils';
import logger from './logger';
import { checkCancelled } from './redisClient';
const { prepareCollectData, executeCollectionQuery } = require('../services/measure.service');

const queue = new Queue('collect-data', {
  redis: { host: process.env.REDIS_HOST || 'localhost', port: process.env.REDIS_PORT || 6379 },
  removeOnSuccess: true,
  removeOnFailure: true
});
queue.on('error', (error: Error) => logger.error('collect-data worker error', error));

queue.process(async job => {
  const { jobId, query, baseVersion } = job.data;
  try {
    // Cancellation is cooperative: an in-flight query may finish before we stop.
    if (await checkCancelled(jobId)) return;
    await client.connect();
    await startCollectDataRequest(jobId);
    if (await checkCancelled(jobId)) return;

    // gather the collect-data FHIR queries (from the dataRequirements), but do not execute them
    const collection: PreparedCollectData = await prepareCollectData(query);
    if (await checkCancelled(jobId)) return;
    const queries: CollectDataQuery[] = collection.queries.map((task, index) => ({
      id: `${jobId}-query-${index}`,
      jobId,
      url: task.url,
      status: 'Pending'
    }));

    // save all of the FHIR queries to be executed as "Pending"
    await saveCollectDataQueries(jobId, queries);

    for (const [index, task] of collection.queries.entries()) {
      if (await checkCancelled(jobId)) return;
      try {
        // execute FHIR query and mark as complete
        await executeCollectionQuery(task, collection.dataEndpoint, baseVersion);
        await completeCollectDataQuery(queries[index].id);
      } catch (error) {
        if (await checkCancelled(jobId)) return;
        await failCollectDataQuery(queries[index].id, error);
        throw error;
      }
    }
    const directory = path.resolve('tmp', jobId);
    if (await checkCancelled(jobId)) return;
    await mkdir(directory, { recursive: true });
    if (await checkCancelled(jobId)) return;
    await writeFile(path.join(directory, 'Parameters.json'), `${JSON.stringify(collection.parameters)}\n`);
    if (await checkCancelled(jobId)) return;
    await completeCollectDataRequest(jobId);
  } catch (error) {
    if (await checkCancelled(jobId)) return;
    await failCollectDataRequest(jobId, error);
    logger.error(`collect-data request ${jobId} failed`, error);
    throw error;
  }
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
