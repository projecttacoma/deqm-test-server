import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { CollectDataStatus, ExportManifest } from '../../database/dbOperations';
import { createDataExchangeMeasureReport } from '../../util/measureUtils';
import type { CollectDataOutputFile, CollectionEvidence, CollectionPlan } from './types';

const RESULT_FILE: CollectDataOutputFile = { type: 'Parameters', fileName: 'Parameters.json', count: 1 };

/**
 * Build the existing subject-oriented transaction Bundles once all evidence has been collected.
 * Extracted from services/measure.service.ts: collectData and prepareCollectData.
 * Report construction now happens after retrieval instead of mutating prepared reports.
 */
export function buildCollectDataParameters(plan: CollectionPlan, evidence: CollectionEvidence): fhir4.Parameters {
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
            evidence.get(target.id) ?? []
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

/**
 * Persist the same Parameters result returned by inline execution as a single NDJSON resource.
 * File-writing code extracted from server/collectDataWorker.ts: queue.process;
 * returning output metadata is new, so polling need not assume a fixed filename.
 */
export async function writeCollectDataResult(
  jobId: string,
  parameters: fhir4.Parameters
): Promise<CollectDataOutputFile[]> {
  const directory = path.resolve('tmp', jobId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, RESULT_FILE.fileName), `${JSON.stringify(parameters)}\n`);
  return [{ ...RESULT_FILE }];
}

/**
 * Present stored artifact metadata; also support requests completed before metadata was stored.
 * Extracted from services/collectdatastatus.service.ts: checkCollectDataStatus's completion branch.
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
