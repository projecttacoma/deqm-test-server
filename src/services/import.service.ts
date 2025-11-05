import { addPendingBulkImportRequest, failBulkImportRequest } from '../database/dbOperations';
import { checkContentTypeHeader } from '../util/baseUtils';
import axios from 'axios';
import { importQueue } from '../queue/importQueue';
import { AxiosError } from 'axios';
import logger from '../server/logger';
import { ExportManifest } from '../database/dbOperations';
import { BadRequestError, NotImplementedError, ResourceNotFoundError } from '../util/errorUtils';

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
  if (!submitter) {
    throw new BadRequestError('Request must include a submitter parameter.');
  }
  if (!submissionId) {
    throw new BadRequestError('Request must include a submissionId parameter.');
  }
  if (!manifestUrl) {
    const submissionStatus = parameters.parameter?.find(p => p.name === 'submissionStatus')?.valueCoding as
      | fhir4.Coding
      | undefined;
    if (submissionStatus?.code && ['complete', 'aborted'].includes(submissionStatus.code)) {
      throw new NotImplementedError(
        'Server does not yet support omission of the manifest url in the case of submission status update.'
      );
    } else {
      throw new BadRequestError('Request must include a manifestUrl parameter or appropriate submission status.');
    }
  }
  if (!baseUrl) {
    throw new BadRequestError('Request must include a FHIRBaseUrl parameter.');
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
    } else {
      // Unexpected error
      throw e;
    }
  }

  // ID assigned to the requesting client
  const clientEntry = `${submitter.value}-${submissionId}`;
  await addPendingBulkImportRequest(manifest, clientEntry, manifestUrl, baseUrl);

  try {
    const inputUrls = manifest.output.map(o => o.url);

    const jobData = {
      clientEntry,
      inputUrls
    };
    await importQueue.createJob(jobData).save();
  } catch (e) {
    if (e instanceof Error) {
      // This creates a failed status -> should we return a 500 here instead/as well?
      await failBulkImportRequest(clientEntry, e);
    }
  }

  res.status(200);
  return;
}

module.exports = { bulkImport };
