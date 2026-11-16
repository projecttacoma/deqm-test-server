import type { Request, Response } from 'express';
import { InternalError, ServiceUnavailableError } from '../util/errorUtils';
import {
  addPendingCollectDataRequest,
  CollectDataStatus,
  completeCollectDataQuery,
  completeCollectDataRequest,
  ExportManifest,
  failCollectDataQuery,
  failCollectDataRequest,
  saveCollectDataQueries,
  startCollectDataRequest
} from '../database/dbOperations';
import { v4 as uuidv4 } from 'uuid';
import { collectDataQueue } from '../queue/collectDataQueue';
import { client } from '../database/connection';
import { checkCancelled } from '../server/redisClient';
import logger from '../server/logger';
import {
  createDataExchangeMeasureReport,
  getPatientIds,
  getResourceQueries,
  patientSpecificDataRequirements
} from '../util/measureUtils';
import { getMeasureBundleFromUrl } from '../util/bundleUtils';
import FHIRClient from '../util/fhirClient';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
const { uploadResourcesFromBundle } = require('../services/bundle.service');

const RESULT_FILE: CollectDataOutputFile = { type: 'Parameters', fileName: 'Parameters.json', count: 1 };

interface CollectionQuery {
  id: string;
  targetId: string;
  url: string;
}

export interface CollectDataOutputFile {
  type: 'Parameters';
  fileName: string;
  count: number;
}

interface CollectDataOptions {
  baseVersion: string;
  respondAsync: boolean;
  isCancelled?: () => Promise<boolean>;
  onProgress?: (progress: CollectDataProgress) => Promise<void>;
}

interface CollectDataJob {
  jobId: string;
  query: CollectDataInput;
  baseVersion: string;
}

interface CollectDataInput {
  measureUrl: string | string[];
  periodStart: string;
  periodEnd: string;
  subject?: string;
  subjectGroup?: fhir4.Group;
  dataEndpoint: fhir4.Endpoint;
}

interface CollectionPlan {
  input: CollectDataInput;
  subjects: {
    patientId: string;
    targets: {
      id: string;
      patientId: string;
      measureBundle: fhir4.Bundle;
    }[];
  }[];
}

type CollectDataProgress =
  | { phase: 'preparing' }
  | { phase: 'queries-prepared'; queries: CollectionQuery[] }
  | { phase: 'query-completed'; query: CollectionQuery }
  | { phase: 'query-failed'; query: CollectionQuery; error: unknown };

/** Unwinds the shared pipeline without treating cooperative cancellation as failure. */
class CollectDataCancelledError extends Error {
  constructor() {
    super('Data collection cancelled.');
  }
}

/**
 * Check for cooperative cancellation before continuing collection.
 * @param options Collection options containing the optional cancellation check.
 * @throws {CollectDataCancelledError} When cancellation has been requested.
 */
async function checkCollectionCancelled(options: CollectDataOptions): Promise<void> {
  if (await options.isCancelled?.()) throw new CollectDataCancelledError();
}

/**
 * Run the shared collection pipeline for inline requests and background jobs.
 * @param input Validated collection scope, measures, period, and data endpoint.
 * @param options Execution mode, FHIR version, cancellation check, and progress callback.
 * @returns Parameters containing the collected data exchange MeasureReports.
 */
export async function performCollectData(
  input: CollectDataInput,
  options: CollectDataOptions
): Promise<fhir4.Parameters> {
  await checkCollectionCancelled(options);
  await options.onProgress?.({ phase: 'preparing' });
  const plan = await prepareCollectionPlan(input);
  await checkCollectionCancelled(options);
  const resourceReferences = await performPlainFHIRQueries(plan, options);
  await checkCollectionCancelled(options);
  return buildCollectDataParameters(plan, resourceReferences);
}

/**
 * Queue a collect-data request and configure its HTTP 202 response and polling headers.
 * @param query Validated collect-data inputs.
 * @param req Incoming request identifying the FHIR version and operation URL.
 * @param res Response to configure after the job has been queued.
 * @throws {ServiceUnavailableError} When asynchronous collection is disabled.
 * @throws {InternalError} When the request cannot be queued.
 */
export async function enqueueAsyncCollectData(query: CollectDataInput, req: Request, res: Response) {
  const workerCount = Number(process.env.COLLECT_DATA_WORKERS);
  if (!Number.isSafeInteger(workerCount) || workerCount <= 0) {
    throw new ServiceUnavailableError(
      'Asynchronous data collection is disabled. Set COLLECT_DATA_WORKERS to a positive integer to enable it.'
    );
  }

  const jobId = uuidv4();
  const baseVersion = req.params.base_version;
  await addPendingCollectDataRequest(jobId, `${process.env.BASE_URL}${req.originalUrl}`);
  try {
    await collectDataQueue.createJob({ jobId, query, baseVersion }).setId(jobId).save();
  } catch (error) {
    await failCollectDataRequest(jobId, error);
    throw new InternalError('Unable to queue the collect-data request.');
  }
  res
    .status(202)
    .set('Content-Location', `${process.env.BASE_URL}/${baseVersion}/collectdatastatus/${jobId}`)
    .set('Retry-After', '1');
}

/**
 * Run a background collection, persist progress, and publish its result file and status.
 * Cooperative cancellation ends the job without recording a failure.
 * @param job Queued job containing its ID, collection inputs, and FHIR version.
 */
export async function executeCollectDataJob({ jobId, query, baseVersion }: CollectDataJob): Promise<void> {
  try {
    await client.connect();
    const parameters = await performCollectData(query, {
      baseVersion,
      respondAsync: true,
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

/**
 * Persist a collection phase or query status for an asynchronous job.
 * @param jobId ID of the collection request to update.
 * @param progress Phase information and any associated query or error.
 */
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
 * Calculate patient-specific requirements, execute FHIR searches, and store their resources.
 * Background searches run sequentially; inline searches run concurrently across targets.
 * @param plan Resolved patients and their measure targets.
 * @param options Execution settings and optional cancellation and progress callbacks.
 * @returns Collected resource references grouped by patient/measure target ID.
 */
async function performPlainFHIRQueries(
  plan: CollectionPlan,
  options: CollectDataOptions
): Promise<Map<string, fhir4.Reference[]>> {
  // Get the patient-specific data requirements for the CollectionPlan
  const calculationOptions = {
    measurementPeriodStart: plan.input.periodStart,
    measurementPeriodEnd: plan.input.periodEnd,
    useExpandedCodeQueries: true
  };

  const queriesByTarget = await Promise.all(
    plan.subjects.flatMap(subject =>
      subject.targets.map(async target => {
        const requirements = await patientSpecificDataRequirements(
          target.measureBundle,
          target.patientId,
          calculationOptions
        );

        return getResourceQueries(requirements, plan.input.dataEndpoint, target.patientId).map((url, index) => ({
          id: `${target.id}-query-${index}`,
          targetId: target.id,
          url
        }));
      })
    )
  );

  const queries: CollectionQuery[] = queriesByTarget.flat();

  await checkCollectionCancelled(options);
  await options.onProgress?.({ phase: 'queries-prepared', queries });
  const resourceReferences: Map<string, fhir4.Reference[]> = new Map();
  /**
   * Fetch and store one search result, associate its references with its target, and report progress.
   * @param query Search URL and identifiers used to associate results and track status.
   */
  const executeQuery = async (query: CollectionQuery) => {
    await checkCollectionCancelled(options);
    try {
      const client = new FHIRClient(plan.input.dataEndpoint.address);
      const entries = await fetchCollectionQuery(query.url, client);
      const references = await storeCollectedResources(entries, options.baseVersion);
      const targetResourceReferences = resourceReferences.get(query.targetId) ?? [];
      targetResourceReferences.push(...references);
      resourceReferences.set(query.targetId, targetResourceReferences);
      await options.onProgress?.({ phase: 'query-completed', query });
    } catch (error) {
      await checkCollectionCancelled(options);
      await options.onProgress?.({ phase: 'query-failed', query, error });
      throw error;
    }
  };

  if (options.respondAsync) {
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
  return resourceReferences;
}

/**
 * Store retrieved resources locally and map their original identities to local identifiers.
 * @param entries Bundle entries returned by a FHIR search.
 * @param baseVersion FHIR version identifying the local storage destination.
 * @returns References preserving source identities and identifying local counterparts.
 */
async function storeCollectedResources(entries: fhir4.BundleEntry[], baseVersion: string): Promise<fhir4.Reference[]> {
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

/**
 * Execute a FHIR search against the configured data endpoint.
 * @param url Search URL to request.
 * @param dataEndpoint Endpoint used to initialize the FHIR client.
 * @returns Response Bundle entries, or an empty array when none are present.
 */
async function fetchCollectionQuery(url: string, client: FHIRClient): Promise<fhir4.BundleEntry[]> {
  const bundle = await client.get<fhir4.Bundle>(url, { headers: { Accept: 'application/fhir+json' } });
  return bundle.entry ?? [];
}

/**
 * Resolve patients and load measures to create one target per patient/measure combination.
 * @param input Collection inputs specifying the subjects, measures, period, and endpoint.
 * @returns Original inputs and resolved subjects with their measure targets.
 */
async function prepareCollectionPlan(input: CollectDataInput): Promise<CollectionPlan> {
  const { subject, subjectGroup, dataEndpoint, measureUrl } = input;
  const patientIds = await getPatientIds(subject, subjectGroup, dataEndpoint);
  const measureUrls = Array.isArray(measureUrl) ? measureUrl : [measureUrl];
  const measureBundles = await Promise.all(measureUrls.map(getMeasureBundleFromUrl));

  const subjects = patientIds.map((patientId, patientIndex) => ({
    patientId,
    targets: measureBundles.map((measureBundle, measureIndex) => ({
      id: `subject-${patientIndex}-measure-${measureIndex}`,
      patientId,
      measureBundle
    }))
  }));
  return { input, subjects };
}

/**
 * Write the collected Parameters resource to the job directory as newline-terminated JSON.
 * @param jobId ID used to select the result directory.
 * @param parameters Completed collection response to serialize.
 * @returns Output file metadata for the completion manifest.
 */
async function writeCollectDataResult(jobId: string, parameters: fhir4.Parameters): Promise<CollectDataOutputFile[]> {
  const directory = path.resolve('tmp', jobId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, RESULT_FILE.fileName), `${JSON.stringify(parameters)}\n`);
  return [{ ...RESULT_FILE }];
}

/**
 * Build the completion manifest from stored output metadata, with a fallback for older jobs.
 * @param status Persisted collection request status and output metadata.
 * @param baseUrl Public server URL used to construct download links.
 * @param baseVersion FHIR version included in download routes.
 * @returns Manifest describing the completed request and its downloadable output.
 */
export function buildCollectDataManifest(
  status: CollectDataStatus,
  baseUrl: string,
  baseVersion: string
): ExportManifest & { request: string } {
  return {
    transactionTime: status.transactionTime,
    request: status.request,
    requiresAccessToken: false,
    output: (status.output ?? [RESULT_FILE]).map(file => ({
      type: file.type,
      url: `${baseUrl}/${baseVersion}/file/${status.id}/${file.fileName}`,
      count: file.count
    })),
    error: []
  };
}

/**
 * Assemble one transaction Bundle per subject with a data exchange report for each measure.
 * @param plan Collection inputs and resolved patient/measure targets.
 * @param resourceReferences Collected references grouped by target ID.
 * @returns Parameters wrapping the subject Bundles as return parameters.
 */
function buildCollectDataParameters(
  plan: CollectionPlan,
  resourceReferences: Map<string, fhir4.Reference[]>
): fhir4.Parameters {
  return {
    resourceType: 'Parameters',
    parameter: plan.subjects.map(subject => ({
      name: 'return',
      resource: {
        resourceType: 'Bundle',
        type: 'transaction',
        id: uuidv4(),
        entry: subject.targets.map(target => {
          const report = createDataExchangeMeasureReport(
            target.measureBundle,
            { start: plan.input.periodStart, end: plan.input.periodEnd },
            { reference: `Patient/${subject.patientId}` },
            resourceReferences.get(target.id) ?? []
          );
          return {
            resource: report,
            request: { method: 'PUT', url: `MeasureReport/${report.id}` },
            fullUrl: `urn:uuid:${report.id}`
          };
        })
      }
    }))
  };
}
