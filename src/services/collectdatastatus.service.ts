//@ts-nocheck
import { getCollectDataStatus, getCollectDataQueryCounts } from '../database/dbOperations';
import { NotFoundError } from '../util/errorUtils';

export async function checkCollectDataStatus(req, res) {
  const status = await getCollectDataStatus(req.params.client_id);
  if (!status) throw new NotFoundError('Collect-data request not found.');
  res.set('Cache-Control', 'no-store');
  if (status.status === 'In Progress') {
    let progress = status.progress;
    if (status.progress === 'Collecting data') {
      const { completed, total } = await getCollectDataQueryCounts(status.id);
      progress =
        completed === total
          ? `${completed} of ${total} queries completed; assembling response`
          : `${completed} of ${total} queries completed (${Math.floor((100 * completed) / total)}%)`;
    }
    res.status(202).set('X-Progress', progress).set('Retry-After', '1');
    return;
  }
  if (status.status === 'Failed') {
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
