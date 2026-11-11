const { uploadResourcesFromBundle } = require('../bundle.service');

/**
 * Store a batch from any retrieval source and preserve original/local resource identities.
 * Extracted from util/measureUtils.ts: pullResourceReferencesFromQuery, after the HTTP fetch.
 * The fetch itself now lives in retrieval/search.ts: fetchCollectionQuery.
 */
export async function storeCollectedResources(
  entries: fhir4.BundleEntry[],
  baseVersion: string
): Promise<fhir4.Reference[]> {
  // Capture source identities before the upload helper rewrites references or resource IDs.
  const originalReferences = entries.map(entry =>
    entry.resource?.resourceType && entry.resource?.id ? `${entry.resource.resourceType}/${entry.resource.id}` : null
  );
  const results: fhir4.BundleEntry[] = await uploadResourcesFromBundle(entries, baseVersion);
  return originalReferences
    .map((reference, index): fhir4.Reference | null => {
      if (!reference) return null;
      const resource = results[index].resource;
      return {
        reference,
        identifier: {
          system: `${process.env.BASE_URL}/${baseVersion}`,
          value: resource?.resourceType && resource?.id ? `${resource.resourceType}/${resource.id}` : undefined
        }
      };
    })
    .filter((reference): reference is fhir4.Reference => reference !== null);
}
