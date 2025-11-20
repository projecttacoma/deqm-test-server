import { addPendingBulkImportRequest, createBulkSubmissionStatus, failBulkImportRequest, getBulkSubmissionStatus, updateSubmissionStatus } from '../database/dbOperations';
import { checkContentTypeHeader, createManifestHash } from '../util/baseUtils';
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

  checkContentTypeHeader(req.headers);

  if (!req.body || req.body.resourceType !== 'Parameters') {
    throw new BadRequestError('Did not receive "Parameters" object as part of request body');
  }
  const parameters = req.body as fhir4.Parameters;
  const submitter = parameters.parameter?.find(p => p.name === 'submitter')?.valueIdentifier as
    | fhir4.Identifier
    | undefined;
  const submissionId = parameters.parameter?.find(p => p.name === 'submissionId')?.valueString;
  const manifestUrl = parameters.parameter?.find(p => p.name === 'manifestUrl')?.valueString;
  const baseUrl = parameters.parameter?.find(p => p.name === 'FHIRBaseUrl')?.valueString;
  const submissionStatus = parameters.parameter?.find(p => p.name === 'submissionStatus')?.valueCoding;
  if (!submitter) {
    throw new BadRequestError('Request must include a submitter parameter.');
  }
  if (!submissionId) {
    throw new BadRequestError('Request must include a submissionId parameter.');
  }
  if (!manifestUrl) {
    if (submissionStatus?.code && (submissionStatus.code === 'complete' || submissionStatus.code === 'aborted')) {
      updateSubmissionStatus(submitter, submissionId, submissionStatus.code);
      
      // exit early because there is no manifest to process
      res.status(200);
      return;
    } else {
      throw new BadRequestError('Request must include a manifestUrl parameter or appropriate submission status.');
    }
  }
  if (!baseUrl) {
    throw new BadRequestError('Request must include a FHIRBaseUrl parameter.');
  }

  const bulkSubmissionStatus = await getBulkSubmissionStatus(submitter, submissionId);
  if(bulkSubmissionStatus?.status === 'aborted' || bulkSubmissionStatus?.status === 'complete'){
    throw new BadRequestError(`Request applies a submission update to existing ${bulkSubmissionStatus?.status} submission`)
  }
  if(!bulkSubmissionStatus){
    await createBulkSubmissionStatus(submitter, submissionId, submissionStatus);
  } else if (submissionStatus?.code && (submissionStatus.code === 'complete' || submissionStatus.code === 'aborted')) {
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

  // ID assigned to the requesting client
  const manifestEntry = createManifestHash(submitter, submissionId, manifestUrl);
  // TODO: May be an existing (must be in progress) clientEntry 
  // -> if so, update to add new manifest or replace existing manifest
  // If existing completed/aborted clientEntry, do not update (BadRequest response to the user with existing status)
  await addPendingBulkImportRequest(manifest, manifestEntry, manifestUrl, baseUrl);

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
      throw new InternalError(`Failed job creation for clientEntry ${submitter.value}-${submissionId} using manifest url ${manifestUrl} with error message: ${e.message}`);
    } else {
      throw e;
    }
  }

  res.status(200);
  return;
}

module.exports = { bulkImport };
