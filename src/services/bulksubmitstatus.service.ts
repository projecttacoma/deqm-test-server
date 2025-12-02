import { getBulkSubmissionStatus } from '../database/dbOperations';
import { BadRequestError, NotFoundError } from '../util/errorUtils';
import logger from '../server/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function bulkSubmitStatus(req: any, res: any) {
  const requestParams: fhir4.Parameters = req.body;

  if (!requestParams.parameter) {
    throw new BadRequestError('$bulk-submit-status endpoint requires a FHIR Parameters resource request body.');
  }

  const submissionId: string | undefined = requestParams.parameter.find(p => p.name === 'submissionId')?.valueString;
  const submitter: fhir4.Identifier | undefined = requestParams.parameter.find(
    p => p.name === 'submitter'
  )?.valueIdentifier;

  if (!submissionId) {
    throw new BadRequestError(
      '$bulk-submit-status endpoint requires a FHIR Parameters resource request body with a submissionId string parameter.'
    );
  }

  if (!submitter || !submitter.value) {
    throw new BadRequestError(
      '$bulk-submit-status endpoint requires a FHIR Parameters resource request body with a submitter Identifier parameter.'
    );
  }

  const clientId = `${submitter.value}-${submissionId}`;

  logger.debug(`Retrieving submission status entry for client: ${clientId}`);
  const submissionStatus = getBulkSubmissionStatus(submitter.value, submissionId);

  if (!submissionStatus) {
    logger.debug(`Writing unable to find bulk import request OperationOutcome to file for client: ${clientId}`);

    throw new NotFoundError(`Could not find submission request with id: ${clientId}`);
  }

  logger.debug(
    `Retrieved the following submission status entry for client: ${clientId}. ${JSON.stringify(submissionStatus)}`
  );

  res.status(202);
  res.setHeader(
    'Content-Location',
    `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/bulkstatus/${clientId}`
  );
  return;
}
