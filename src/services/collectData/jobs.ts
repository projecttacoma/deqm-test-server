import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { client } from '../../database/connection';
import {
  addPendingCollectDataRequest,
  startCollectDataRequest,
  saveCollectDataQueries,
  completeCollectDataQuery,
  failCollectDataQuery,
  completeCollectDataRequest,
  failCollectDataRequest
} from '../../database/dbOperations';
import { collectDataQueue } from '../../queue/collectDataQueue';
import logger from '../../server/logger';
import { checkCancelled } from '../../server/redisClient';
import { InternalError, ServiceUnavailableError } from '../../util/errorUtils';
import { writeCollectDataResult } from './result';
import { performCollectData } from './run';
import { CollectDataCancelledError } from './types';
import type { CollectDataInput, CollectDataJob, CollectDataProgress } from './types';

/**
 * Accept asynchronous work without resolving measures or retrieving clinical data.
 * Extracted from services/measure.service.ts: collectData's respondAsync branch.
 */
export async function enqueueAsyncCollectData(input: CollectDataInput, req: Request, res: Response): Promise<void> {
  const workerCount = Number(process.env.COLLECT_DATA_WORKERS);
  if (!Number.isSafeInteger(workerCount) || workerCount <= 0) {
    throw new ServiceUnavailableError(
      'Asynchronous data collection is disabled. Set COLLECT_DATA_WORKERS to a positive integer to enable it.'
    );
  }
  const jobId = uuidv4();
  const baseVersion = req.params.base_version;
  const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  await addPendingCollectDataRequest(jobId, `${baseUrl}${req.originalUrl}`);
  try {
    await collectDataQueue.createJob({ jobId, query: input, baseVersion }).setId(jobId).save();
  } catch (error) {
    await failCollectDataRequest(jobId, error);
    throw new InternalError('Unable to queue the collect-data request.');
  }
  res
    .status(202)
    .set('Content-Location', `${baseUrl}/${baseVersion}/collectdatastatus/${jobId}`)
    .set('Retry-After', '1');
}

/** Database progress updates extracted from server/collectDataWorker.ts: queue.process. */
async function recordCollectDataProgress(jobId: string, progress: CollectDataProgress): Promise<void> {
  switch (progress.phase) {
    case 'preparing':
      await startCollectDataRequest(jobId);
      break;
    case 'queries-prepared':
      await saveCollectDataQueries(
        jobId,
        progress.queries.map(query => ({ id: `${jobId}-${query.id}`, jobId, url: query.url, status: 'Pending' }))
      );
      break;
    case 'query-completed':
      await completeCollectDataQuery(`${jobId}-${progress.query.id}`);
      break;
    case 'query-failed':
      await failCollectDataQuery(`${jobId}-${progress.query.id}`, progress.error);
      break;
  }
}

/**
 * Drive the shared flow and adapt its progress and result to the background job lifecycle.
 * Job setup, completion and error handling extracted from server/collectDataWorker.ts: queue.process.
 * The worker's collection sequence is now shared with inline execution through performCollectData.
 */
export async function executeCollectDataJob({ jobId, query, baseVersion }: CollectDataJob): Promise<void> {
  try {
    await client.connect();
    const parameters = await performCollectData(query, {
      baseVersion,
      performAsync: true,
      isCancelled: () => checkCancelled(jobId),
      onProgress: progress => recordCollectDataProgress(jobId, progress)
    });
    if (await checkCancelled(jobId)) return;
    const output = await writeCollectDataResult(jobId, parameters);
    if (await checkCancelled(jobId)) return;
    await completeCollectDataRequest(jobId, output);
  } catch (error) {
    if (error instanceof CollectDataCancelledError || (await checkCancelled(jobId))) return;
    await failCollectDataRequest(jobId, error);
    logger.error(`collect-data request ${jobId} failed`, error);
    throw error;
  }
}
