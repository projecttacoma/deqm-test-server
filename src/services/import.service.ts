import { addPendingBulkImportRequest, failBulkImportRequest } from '../database/dbOperations';
import { checkContentTypeHeader } from '../util/baseUtils';
import axios from 'axios';
import { importQueue } from '../queue/importQueue';
import { AxiosError } from 'axios';
import logger from '../server/logger';
import { ExportManifest } from '../database/dbOperations';
import { BadRequestError, ResourceNotFoundError } from '../util/errorUtils';

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
    throw new BadRequestError('Request must include a manifestUrl parameter.');
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
  await addPendingBulkImportRequest(manifest, clientEntry, baseUrl);

  try {
    const inputUrls = manifest.output.map(o => o.url);

    const jobData = {
      clientEntry,
      inputUrls
    };
    await importQueue.createJob(jobData).save();
  } catch (e) {
    if (e instanceof Error) {
      await failBulkImportRequest(clientEntry, e);
    }
  }

  res.status(202);
  res.setHeader(
    'Content-Location',
    `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/bulkstatus/${clientEntry}`
  );
  return;
}

module.exports = { bulkImport };
