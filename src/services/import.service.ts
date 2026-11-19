import { createBulkSubmissionStatus, getBulkSubmissionStatus, updateSubmissionStatus } from '../database/dbOperations';
import { importQueue } from '../queue/importQueue';
import logger from '../server/logger';
import { BadRequestError } from '../util/errorUtils';

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
    fhir4.Identifier | undefined;
  const submissionId = parameters.parameter?.find(p => p.name === 'submissionId')?.valueString;
  const manifestUrl = parameters.parameter?.find(p => p.name === 'manifestUrl')?.valueUrl;
  const baseUrl = parameters.parameter?.find(p => p.name === 'fhirBaseUrl')?.valueUrl;
  const submissionStatus = parameters.parameter?.find(p => p.name === 'submissionStatus')?.valueCoding;
  const replacesManifestUrl = parameters.parameter?.find(p => p.name === 'replacesManifestUrl')?.valueUrl;
  if (!submitter?.value) {
    throw new BadRequestError('Request must include a submitter parameter with a value.');
  }
  if (!submissionId) {
    throw new BadRequestError('Request must include a submissionId parameter.');
  }
  if (!manifestUrl) {
    if (submissionStatus?.code && (submissionStatus.code === 'completed' || submissionStatus.code === 'stopped')) {
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
  if (bulkSubmissionStatus?.status === 'stopped' || bulkSubmissionStatus?.status === 'completed') {
    throw new BadRequestError(
      `Request applies a submission update to existing ${bulkSubmissionStatus?.status} submission`
    );
  }
  if (!bulkSubmissionStatus) {
    bulkSubmissionStatus = await createBulkSubmissionStatus(submitter, submissionId, submissionStatus);
  } else if (submissionStatus?.code === 'completed' || submissionStatus?.code === 'stopped') {
    // Update submission status to prevent any further incoming requests
    await updateSubmissionStatus(submitter, submissionId, submissionStatus.code);
  }

  const job = importQueue.createJob({
    submissionClientId: bulkSubmissionStatus.id,
    manifestUrl,
    providerBaseUrl: baseUrl,
    replacesManifestUrl
  });

  job.retries(30);
  job.backoff('fixed', 1000);

  const createdJob = await job.save();

  logger.debug(`Queued manifest retrieval job ${createdJob.id} for ${manifestUrl}`);

  res.status(200);
  return;
}
module.exports = { bulkImport };
