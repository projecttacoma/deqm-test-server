import {
  addPendingBulkImportRequest,
  cancelBulkImport,
  createBulkSubmissionStatus,
  failBulkImportRequest,
  getBulkImportStatus,
  getBulkSubmissionStatus,
  updateSubmissionStatus
} from '../database/dbOperations';
import { createManifestHash } from '../util/baseUtils';
import axios from 'axios';
import { importQueue } from '../queue/importQueue';
import { AxiosError } from 'axios';
import logger from '../server/logger';
import { ExportManifest } from '../database/dbOperations';
import { BadRequestError, InternalError, ResourceNotFoundError } from '../util/errorUtils';

/**
 * Executes an import of all the resources on the passed in server.
 * @param {Object} req The request object passed in by the client
 * @param {Object} res The response object returned to the client by the server
 */
// TODO: update with relevant types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function bulkImport(req: any, res: any) {
  logger.info('Base >>> Import');
  logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  logger.debug(`Request params: ${JSON.stringify(req.params)}`);

  if (!req.body || req.body.resourceType !== 'Parameters') {
    throw new BadRequestError('Did not receive "Parameters" object as part of request body');
  }
  const parameters = req.body as fhir4.Parameters;
  const submitter = parameters.parameter?.find(p => p.name === 'submitter')?.valueIdentifier as
    | fhir4.Identifier
    | undefined;
  const submissionId = parameters.parameter?.find(p => p.name === 'submissionId')?.valueString;
  const manifestUrl = parameters.parameter?.find(p => p.name === 'manifestUrl')?.valueString;
  const baseUrl = parameters.parameter?.find(p => p.name === 'fhirBaseUrl')?.valueString;
  const submissionStatus = parameters.parameter?.find(p => p.name === 'submissionStatus')?.valueCoding;
  const replacesManifestUrl = parameters.parameter?.find(p => p.name === 'replacesManifestUrl')?.valueString;
  if (!submitter?.value) {
    throw new BadRequestError('Request must include a submitter parameter with a value.');
  }
  if (!submissionId) {
    throw new BadRequestError('Request must include a submissionId parameter.');
  }
  if (!manifestUrl) {
    if (submissionStatus?.code && (submissionStatus.code === 'complete' || submissionStatus.code === 'aborted')) {
      await updateSubmissionStatus(submitter, submissionId, submissionStatus.code);

      // exit early because there is no manifest to process
      res.status(200);
      return;
    } else {
      throw new BadRequestError('Request must include a manifestUrl parameter or appropriate submission status.');
    }
  }
  if (!baseUrl) {
    throw new BadRequestError('Request must include a fhirBaseUrl parameter.');
  }

  let bulkSubmissionStatus = await getBulkSubmissionStatus(submitter.value, submissionId);
  if (bulkSubmissionStatus?.status === 'aborted' || bulkSubmissionStatus?.status === 'complete') {
    throw new BadRequestError(
      `Request applies a submission update to existing ${bulkSubmissionStatus?.status} submission`
    );
  }
  if (!bulkSubmissionStatus) {
    bulkSubmissionStatus = await createBulkSubmissionStatus(submitter, submissionId, submissionStatus);
  } else if (submissionStatus?.code === 'complete' || submissionStatus?.code === 'aborted') {
    // Update submission status to prevent any further incoming requests
    await updateSubmissionStatus(submitter, submissionId, submissionStatus.code);
  }

  let manifest: ExportManifest;
  try {
    manifest = (await axios.get(manifestUrl))?.data;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const error = e as AxiosError;
      throw new ResourceNotFoundError(
        `Was unable to resolve manifest url ${manifestUrl}. Received error: ${error.message}`
      );
    } else if (e instanceof Error) {
      // Unexpected error
      throw new InternalError(
        `Unexpected failed retrieval of manifest at ${manifestUrl} with error message: ${e.message}`
      );
    } else {
      throw e;
    }
  }

  // handle manifest url replacement
  if (replacesManifestUrl) {
    const manifestId = createManifestHash(bulkSubmissionStatus.id, replacesManifestUrl);
    const existingBulkImportRequest = await getBulkImportStatus(manifestId);
    if (!existingBulkImportRequest) {
      throw new BadRequestError(`Unable to find status for manifest specified for replacement: ${replacesManifestUrl}`);
    } else {
      await cancelBulkImport(manifestId);
    }
    // TODO: continue implementing...
    // 1. Stop existing job ... (do we also need to stop the ndjson jobs?, could maybe wait for it to complete but is inefficient)
    // 2. Remove all resources from existing job
    // => this is also resource intensive. We would need a job to clean this up
    // 3. Delete existing bulkImport status?

    // Problem: do we have a way of pulling out already imported ndjson files?
    // For insert, we're doing a straight updateResource -> would have to find all of cancelled job's imported resource ids and delete
    // Problem: no current way of looking up existing jobs, might need to store job id information for look up
    // If we wait for job to finish, might need different handling for waiting vs when the job is already complete at request time
  }

  const manifestEntry = await addPendingBulkImportRequest(manifest, bulkSubmissionStatus.id, manifestUrl, baseUrl);
  try {
    const inputUrls = manifest.output.map(o => o.url);

    const jobData = {
      manifestEntry,
      inputUrls
    };
    await importQueue.createJob(jobData).save();
  } catch (e) {
    if (e instanceof Error) {
      // This creates a failed status -> should we return a 500 here instead/as well?
      await failBulkImportRequest(manifestEntry, e);
      throw new InternalError(
        `Failed job creation for clientEntry ${submitter.value}-${submissionId} using manifest url ${manifestUrl} with error message: ${e.message}`
      );
    } else {
      throw e;
    }
  }

  res.status(200);
  return;
}

module.exports = { bulkImport };
