import { ExportManifest, getBulkImportStatus, getNdjsonFileStatus } from '../database/dbOperations';
import logger from '../server/logger';
import { NotFoundError } from '../util/errorUtils';
const fs = require('fs');
const path = require('path');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkBulkStatus(req: any, res: any) {
  const clientId: string = req.params.client_id;
  logger.debug(`Retrieving bulkStatus entry for client: ${clientId}`);
  const bulkStatus = await getBulkImportStatus(clientId);
  const submissionId = clientId.split('-')[1];
  const urlBase = `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/file/${clientId}/`;

  if (!bulkStatus) {
    // we want to throw an error that it would not find the bulk import request with id
    throw new NotFoundError(`Could not find $bulk-submit request with id: ${clientId}`);
  }

  // We need to build the export manifest with a TS type that we define since it is not a
  // FHIR resource. See https://build.fhir.org/ig/HL7/bulk-data/export.html#response---output-manifest
  const exportManifest: ExportManifest = {
    transactionTime: new Date() as unknown as string,
    request: bulkStatus.importManifest.request,
    requiresAccessToken: bulkStatus.importManifest.requiresAccessToken,
    extension: { submissionId: submissionId },
    output: [],
    error: []
  };

  if (bulkStatus.status === 'In Progress') {
    logger.debug(`bulkStatus entry is in progress`);
    // Bulk Submit Draft IG: "The Data Recipient MAY return a partial export manifest and a
    // HTTP status of 202 while the submission is incomplete or being processed"
    res.status(202);
    // Compute percent of files or resources exported
    logger.debug(`Calculating bulkStatus percent complete for clientId: ${clientId}`);
    let percentComplete;
    // Use file counts for percentage if export server does not record resource counts
    if (bulkStatus.exportedResourceCount === -1) {
      percentComplete = (bulkStatus.totalFileCount - bulkStatus.exportedFileCount) / bulkStatus.totalFileCount;
    } else {
      percentComplete =
        (bulkStatus.totalResourceCount - bulkStatus.exportedResourceCount) / bulkStatus.totalResourceCount;
    }
    res.set('X-Progress', `${(percentComplete * 100).toFixed(2)}% Done`);
    res.set('Retry-After', 120);
  } else if (bulkStatus.status === 'Failed') {
    // Not sure what the response should be - adding an OperationOutcome to an errors.ndjson
    // file for now
    logger.debug(`bulkStatus entry is failed`);
    res.status(200);

    const operationOutcomeOutput: fhir4.OperationOutcome[] = [
      {
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'fatal',
            code: 'transient',
            details: {
              text: bulkStatus.error.message ?? "Internal System Error: '$bulk-submit' request not processed."
            }
          }
        ]
      }
    ];

    writeToFile(operationOutcomeOutput, clientId, false);

    exportManifest.error.push({
      extension: {
        manifestUrl: bulkStatus.manifestUrl
      },
      url: `${urlBase}errors.ndjson`
    });

    return exportManifest;
  } else if (bulkStatus.status === 'Completed') {
    // Bulk Submit Draft IG - "the Data Recipient SHALL return an export manifest and
    // a HTTP status of 200"
    logger.debug(`bulkStatus entry is completed`);
    res.status(200);

    // need to look at errors
    if (bulkStatus.failedOutcomes.length > 0) {
      logger.debug('bulkStatus entry contains failed outcomes');
      // We will want to write this errors to an OperationOutcome
      // ndjson file and then add them to the errors section of
      // the manifest according to the Bulk Submit Draft IG
      const operationOutcomesOutput: fhir4.OperationOutcome[] = [];
      // here we want to write the OperationOutcomes to an ndjson file
      for (const output of bulkStatus.importManifest.output) {
        const ndjsonStatus = await getNdjsonFileStatus(clientId, output.url);
        if (ndjsonStatus) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ndjsonStatus.failedOutcomes.forEach((fail: any) => {
            operationOutcomesOutput.push({
              resourceType: 'OperationOutcome',
              issue: [
                {
                  severity: 'error',
                  code: 'processing',
                  details: { text: fail }
                }
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/artifact-relatedArtifact',
                  valueRelatedArtifact: {
                    type: 'documentation',
                    url: output.url
                  }
                }
              ]
            });
          });
        }
      }
      // write array of OperationOutcomes to an ndjson file
      writeToFile(operationOutcomesOutput, clientId, false);

      // here we want to add an entry to the error array on the export manifest
      exportManifest.error.push({
        extension: {
          manifestUrl: bulkStatus.manifestUrl
        },
        url: `${urlBase}errors.ndjson`
      });
    } else {
      // From the Bulk Submit Draft IG: "If there are resources to return,
      // the Data Recipient SHALL populate the `output` section of the
      // manifest with one or more files that contain FHIR resources."
      const operationOutcomesOutput: fhir4.OperationOutcome[] = [];
      for (const output of bulkStatus.importManifest.output) {
        const ndjsonStatus = await getNdjsonFileStatus(clientId, output.url);
        if (ndjsonStatus?.successCount) {
          operationOutcomesOutput.push({
            resourceType: 'OperationOutcome',
            issue: [
              {
                severity: 'information',
                code: 'informational',
                details: { text: `Successfully processed ${ndjsonStatus.successCount} rows.` }
              }
            ],
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/artifact-relatedArtifact',
                valueRelatedArtifact: {
                  type: 'documentation',
                  url: output.url
                }
              }
            ]
          });
        }
      }

      writeToFile(operationOutcomesOutput, clientId, true);

      exportManifest.output.push({
        extension: {
          manifestUrl: bulkStatus.manifestUrl
        },
        url: `${urlBase}output.ndjson`
      });
    }

    return exportManifest;
  }
}

const writeToFile = function (operationOutcomes: fhir4.OperationOutcome[], clientId: string, success: boolean) {
  const dirpath = './tmp/' + clientId;
  fs.mkdirSync(dirpath, { recursive: true });
  const filename = success ? path.join(dirpath, 'output.ndjson') : path.join(dirpath, 'errors.ndjson');

  let lineCount = 0;
  if (operationOutcomes.length > 0) {
    const stream = fs.createWriteStream(filename, { flags: 'a' });
    operationOutcomes.forEach(oo => {
      stream.write((++lineCount === 1 ? '' : '\r\n') + JSON.stringify(oo));
    });
    stream.end();
  } else return;
};
