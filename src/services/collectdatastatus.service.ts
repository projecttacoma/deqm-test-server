import type { Request, Response } from 'express';
import { CollectDataRequestStatus, getCollectDataStatus, getCollectDataQueryCounts } from '../database/dbOperations';
import { NotFoundError } from '../util/errorUtils';
import { checkCancelled, setCancelled } from '../server/redisClient';
import { collectDataQueue } from '../queue/collectDataQueue';

export async function checkCollectDataStatus(req: Request, res: Response) {
  const status = await getCollectDataStatus(req.params.client_id);
  if (!status || (await checkCancelled(status.id))) throw new NotFoundError('Collect-data request not found.');
  res.set('Cache-Control', 'no-store');
  if (
    status.status === CollectDataRequestStatus.Queued ||
    status.status === CollectDataRequestStatus.Preparing ||
    status.status === CollectDataRequestStatus.Collecting
  ) {
    let progress =
      status.status === CollectDataRequestStatus.Queued ? 'Queued for data collection' : 'Preparing FHIR queries';
    if (status.status === CollectDataRequestStatus.Collecting) {
      const { completed, total } = await getCollectDataQueryCounts(status.id);
      progress =
        completed === total
          ? `${completed} of ${total} queries completed; assembling response`
          : `${completed} of ${total} queries completed (${Math.floor((100 * completed) / total)}%)`;
    }
    res.status(202).set('X-Progress', progress).set('Retry-After', '1');
    return;
  }
  if (status.status === CollectDataRequestStatus.Failed) {
    res.status(500).type('application/fhir+json');
    return {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', details: { text: status.error || 'Data collection failed.' } }]
    };
  }
  const baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
  return {
    transactionTime: status.transactionTime,
    request: status.request,
    requiresAccessToken: false,
    output: [
      { type: 'Parameters', url: `${baseUrl}/${req.params.base_version}/file/${status.id}/Parameters.json`, count: 1 }
    ],
    error: []
  };
}

/** Flags collection for cancellation and removes any queued work. */
export async function cancelCollectData(req: Request) {
  const id = req.params.client_id;
  if (!(await getCollectDataStatus(id))) throw new NotFoundError('Collect-data request not found.');
  await setCancelled(id);
  await collectDataQueue.removeJob(id);
}
