import { prepareCollectionPlan } from './plan';
import { performPlainFhirQueries } from './retrieval/search';
import { buildCollectDataParameters } from './result';
import { checkCollectionCancelled } from './types';
import type { CollectDataInput, CollectDataOptions } from './types';

/**
 * The primary collection flow, shared by inline requests and background jobs.
 * Consolidates orchestration formerly in services/measure.service.ts: collectData
 * and server/collectDataWorker.ts: queue.process. Each stage points to its extracted implementation.
 */
export async function performCollectData(
  input: CollectDataInput,
  options: CollectDataOptions
): Promise<fhir4.Parameters> {
  await checkCollectionCancelled(options);
  await options.onProgress?.({ phase: 'preparing' });
  const plan = await prepareCollectionPlan(input);
  await checkCollectionCancelled(options);
  // Retrieval strategy selection belongs here when additional source capabilities are supported.
  const evidence = await performPlainFhirQueries(plan, options);
  await checkCollectionCancelled(options);
  return buildCollectDataParameters(plan, evidence);
}
