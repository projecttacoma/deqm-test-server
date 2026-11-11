import FHIRClient from '../../../util/fhirClient';
import { getResourceQueries } from '../../../util/measureUtils';
import { storeCollectedResources } from '../resources';
import { checkCollectionCancelled } from '../types';
import type { CollectDataOptions, CollectionEvidence, CollectionPlan, CollectionQuery } from '../types';

/**
 * Translate requirements into searches, leaving the collection plan transport-independent.
 * Extracted from services/measure.service.ts: prepareCollectData's getResourceQueries loop.
 * Queries now identify collection targets instead of holding mutable MeasureReport objects.
 */
export function prepareCollectionQueries(plan: CollectionPlan): CollectionQuery[] {
  return plan.subjects.flatMap(subject =>
    subject.targets.flatMap(target =>
      getResourceQueries(target.requirements, plan.input.dataEndpoint, target.patientId).map((url, index) => ({
        id: `${target.id}-query-${index}`,
        targetId: target.id,
        url
      }))
    )
  );
}

/**
 * Fetch resources without storing them or constructing MeasureReport references.
 * HTTP-fetch portion of util/measureUtils.ts: pullResourceReferencesFromQuery.
 * Its storage/reference mapping now lives in ../resources.ts: storeCollectedResources.
 */
export async function fetchCollectionQuery(url: string, dataEndpoint: fhir4.Endpoint): Promise<fhir4.BundleEntry[]> {
  const client = new FHIRClient(dataEndpoint.address);
  const bundle = await client.get<fhir4.Bundle>(url, { headers: { Accept: 'application/fhir+json' } });
  return bundle.entry ?? [];
}

/**
 * Retrieve evidence by target; inline execution retains concurrency across subject/measure pairs.
 * Consolidates util/measureUtils.ts: pullResourceReferences's sequential search loop
 * and server/collectDataWorker.ts: queue.process's tracked query loop.
 * Evidence association replaces services/measure.service.ts: executeCollectionQuery's report mutation.
 */
export async function performPlainFhirQueries(
  plan: CollectionPlan,
  options: CollectDataOptions
): Promise<CollectionEvidence> {
  const queries = prepareCollectionQueries(plan);
  await options.onProgress?.({ phase: 'queries-prepared', queries });
  const evidence: CollectionEvidence = new Map();

  const executeQuery = async (query: CollectionQuery) => {
    await checkCollectionCancelled(options);
    try {
      const entries = await fetchCollectionQuery(query.url, plan.input.dataEndpoint);
      const references = await storeCollectedResources(entries, options.baseVersion);
      const targetEvidence = evidence.get(query.targetId) ?? [];
      targetEvidence.push(...references);
      evidence.set(query.targetId, targetEvidence);
      await options.onProgress?.({ phase: 'query-completed', query });
    } catch (error) {
      await checkCollectionCancelled(options);
      await options.onProgress?.({ phase: 'query-failed', query, error });
      throw error;
    }
  };

  if (options.performAsync) {
    for (const query of queries) await executeQuery(query);
  } else {
    await Promise.all(
      plan.subjects.flatMap(subject =>
        subject.targets.map(async target => {
          for (const query of queries.filter(query => query.targetId === target.id)) await executeQuery(query);
        })
      )
    );
  }
  return evidence;
}
