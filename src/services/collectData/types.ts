import type { DRCalculationOutput } from 'fqm-execution';

/** Validated operation inputs. Preserve the requested scope as well as resolved patients. */
export interface CollectDataInput {
  measureUrl: string | string[];
  periodStart: string;
  periodEnd: string;
  subject?: string;
  subjectGroup?: fhir4.Group;
  dataEndpoint: fhir4.Endpoint;
}

/**
 * One subject/measure association, independent of retrieval and report construction.
 * Replaces PreparedCollectDataQuery's MeasureReport pointer, formerly in util/measureUtils.ts.
 */
export interface CollectionTarget {
  id: string;
  patientId: string;
  measureBundle: fhir4.Bundle;
  requirements: DRCalculationOutput;
}

export interface CollectionPlan {
  input: CollectDataInput;
  subjects: { patientId: string; targets: CollectionTarget[] }[];
}

export interface CollectionQuery {
  id: string;
  targetId: string;
  url: string;
}

export type CollectionEvidence = Map<string, fhir4.Reference[]>;

export type CollectDataProgress =
  | { phase: 'preparing' }
  | { phase: 'queries-prepared'; queries: CollectionQuery[] }
  | { phase: 'query-completed'; query: CollectionQuery }
  | { phase: 'query-failed'; query: CollectionQuery; error: unknown };

export interface CollectDataOptions {
  baseVersion: string;
  performAsync: boolean;
  isCancelled?: () => Promise<boolean>;
  onProgress?: (progress: CollectDataProgress) => Promise<void>;
}

export interface CollectDataJob {
  jobId: string;
  query: CollectDataInput;
  baseVersion: string;
}

export interface CollectDataOutputFile {
  type: 'Parameters';
  fileName: string;
  count: number;
}

/** Unwinds the shared pipeline without treating cooperative cancellation as failure. */
export class CollectDataCancelledError extends Error {
  constructor() {
    super('Data collection cancelled.');
  }
}

export async function checkCollectionCancelled(options: CollectDataOptions): Promise<void> {
  if (await options.isCancelled?.()) throw new CollectDataCancelledError();
}
