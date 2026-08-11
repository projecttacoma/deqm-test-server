import axios from 'axios';
import { findResourceById } from '../database/dbOperations';
import { checkSupportedResource } from '../util/baseUtils';
import { BadRequestError, InternalError, ResourceNotFoundError } from '../util/errorUtils';
import logger from '../server/logger';
import { gatherParams, validateKickoffSubmitParams } from '../util/operationValidationUtils';
import { v4 as uuidv4 } from 'uuid';

/**
 * Parse a relative FHIR reference used to identify a stored resource.
 */
function parseResourceReference(reference: string): { resourceType: string; id: string } {
  const parts = reference.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new BadRequestError(
      `evaluatedResource references must use the local relative form 'ResourceType/id'. Received '${reference}'.`
    );
  }
  return { resourceType: parts[0], id: parts[1] };
}

/**
 * Build and send a transaction Bundle for a data exchange MeasureReport and its evaluated resources.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function kickoffSubmit(req: any, res: any) {
  logger.info('Base >>> kickoff-submit');
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);

  if (!req.body || typeof req.body !== 'object' || (req.body as fhir4.FhirResource).resourceType !== 'Parameters') {
    throw new BadRequestError('Request body must be a FHIR Parameters resource.');
  }
  const query = gatherParams(req.query, req.body);
  validateKickoffSubmitParams(query);
  const report = query.report as fhir4.MeasureReport;
  const receiverEndpoint = query.receiverEndpoint as fhir4.Endpoint;

  const evaluatedResources = await Promise.all(
    (report.evaluatedResource ?? []).map(async evaluatedResource => {
      if (!evaluatedResource.reference) {
        throw new BadRequestError('Each evaluatedResource must include a reference.');
      }
      const { resourceType, id } = parseResourceReference(evaluatedResource.reference);
      checkSupportedResource(resourceType);
      const resource = await findResourceById(id, resourceType);
      if (!resource) {
        throw new ResourceNotFoundError(
          `Could not find ${resourceType}/${id} referenced by MeasureReport.evaluatedResource.`
        );
      }
      return resource as unknown as fhir4.FhirResource;
    })
  );

  const resources = [report, ...evaluatedResources];
  const transactionBundle: fhir4.Bundle = {
    resourceType: 'Bundle',
    id: uuidv4(),
    type: 'transaction',
    entry: resources.map(resource => ({
      resource,
      request: {
        method: 'PUT',
        url: `${resource.resourceType}/${resource.id}`
      }
    }))
  };

  try {
    const response = await axios.post(receiverEndpoint.address, transactionBundle, {
      headers: {
        Accept: 'application/fhir+json',
        'Content-Type': 'application/fhir+json'
      }
    });
    logger.info(`Successfully submitted transaction Bundle to ${receiverEndpoint.address}`);
    res.status(response.status);
    return response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new InternalError(`Unable to submit transaction Bundle to ${receiverEndpoint.address}: ${message}`);
  }
}
