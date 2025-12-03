import {
  ExportManifest,
  getBulkImportStatuses,
  getBulkSubmissionStatus,
  getNdjsonFileStatus
} from '../database/dbOperations';
import logger from '../server/logger';
import { NotFoundError } from '../util/errorUtils';
const fs = require('fs');
const path = require('path');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function checkBulkStatus(req: any, res: any) {
  const clientId: string = req.params.client_id;
  logger.debug(`Retrieving bulkStatus entry for client: ${clientId}`);

  const bulkStatuses = await getBulkImportStatuses(clientId);

  // Note: This approach allows dashes in the submission id but not in the submitter value
  const [submitterValue, submissionId] = [
    clientId.slice(0, clientId.indexOf('-')),
    clientId.slice(clientId.indexOf('-') + 1)
  ];
  const submissionStatus = await getBulkSubmissionStatus(submitterValue, submissionId);

  if (!bulkStatuses || bulkStatuses.length === 0) {
    throw new NotFoundError(`Could not find any import manifests for submission with id: ${clientId}`);
  }

  // For submission to finish, it must be marked as complete/aborted and no outstanding in progress imports
  if (
    (submissionStatus?.status === 'complete' || submissionStatus?.status === 'aborted') &&
    !bulkStatuses.some(bs => bs.status === 'In Progress')
  ) {
    // We need to build the export manifest with a TS type that we define since it is not a
    // FHIR resource. See https://build.fhir.org/ig/HL7/bulk-data/export.html#response---output-manifest
    const exportManifest: ExportManifest = {
      transactionTime: new Date() as unknown as string,
      request: `${req.protocol}://${req.hostname}${req.originalUrl}`,
      requiresAccessToken: false,
      extension: { submissionId: submissionId },
      output: [],
      error: []
    };
    // Bulk Submit Draft IG - "the Data Recipient SHALL return an export manifest and
    // a HTTP status of 200"
    res.status(200);
    for (const bulkStatus of bulkStatuses) {
      const urlBase = `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/file/${bulkStatus.id}/`;
      if (bulkStatus.status === 'Failed') {
        // Not sure what the response should be - adding an OperationOutcome to an errors.ndjson
        // file for now
        logger.debug(`bulkStatus ${bulkStatus.id} entry is failed`);

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

        writeToFile(operationOutcomeOutput, bulkStatus.id, false);
        exportManifest.error.push({
          extension: {
            manifestUrl: bulkStatus.manifestUrl
          },
          url: `${urlBase}errors.ndjson`
        });
      } else if (bulkStatus.status === 'Completed') {
        logger.debug(`bulkStatus entry ${bulkStatus.id} is completed`);

        const operationOutcomesOutput: fhir4.OperationOutcome[] = [];
        // here we want to write the OperationOutcomes to an ndjson file
        for (const output of bulkStatus.importManifest.output) {
          const ndjsonStatus = await getNdjsonFileStatus(bulkStatus.id, output.url);
          if (ndjsonStatus) {
            //Add total of successes first
            if (ndjsonStatus.successCount) {
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

            // Then add each error to an OperationOutcome and then add them to the errors
            // section of the manifest according to the Bulk Submit Draft IG

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

        if (bulkStatus.failedOutcomes.length > 0) {
          logger.debug('bulkStatus entry contains failed outcomes');

          // write array of OperationOutcomes to an ndjson file
          writeToFile(operationOutcomesOutput, bulkStatus.id, false);

          // add an entry to the error array on the export manifest
          exportManifest.error.push({
            extension: {
              manifestUrl: bulkStatus.manifestUrl
            },
            url: `${urlBase}errors.ndjson`
          });
        } else {
          writeToFile(operationOutcomesOutput, bulkStatus.id, true);
          // From the Bulk Submit Draft IG: "If there are resources to return,
          // the Data Recipient SHALL populate the `output` section of the
          // manifest with one or more files that contain FHIR resources."
          exportManifest.output.push({
            extension: {
              manifestUrl: bulkStatus.manifestUrl
            },
            url: `${urlBase}output.ndjson`
          });
        }
      }
    }

    return exportManifest;
  } else {
    // Bulk Submit Draft IG: "The Data Recipient MAY return a partial export manifest and a
    // HTTP status of 202 while the submission is incomplete or being processed"
    // future TODO: create partial manifest
    res.status(202);

    const useFileCount = bulkStatuses.some(bs => bs.resourcesToExportCount === -1);
    let total = 0;
    let complete = 0;
    bulkStatuses.forEach(bulkStatus => {
      if (bulkStatus.status === 'In Progress') {
        logger.debug(`bulkStatus entry ${bulkStatus.id} is in progress`);
      }

      // Use file counts for percentage if export server does not record resource counts
      if (useFileCount) {
        complete += bulkStatus.totalFileCount - bulkStatus.filesToExportCount;
        total += bulkStatus.totalFileCount;
        logger.debug(
          `Percent complete for bulkStatus ${bulkStatus.id} is ${(bulkStatus.totalFileCount - bulkStatus.filesToExportCount) / bulkStatus.totalFileCount}`
        );
      } else {
        complete += bulkStatus.totalResourceCount - bulkStatus.resourcesToExportCount;
        total += bulkStatus.totalResourceCount;
        logger.debug(
          `Percent complete for bulkStatus ${bulkStatus.id} is ${(bulkStatus.totalResourceCount - bulkStatus.resourcesToExportCount) / bulkStatus.totalResourceCount}`
        );
      }
    });

    logger.debug(`Calculating submission percent complete for clientId: ${clientId}`);
    res.set('X-Progress', `${((complete / total) * 100).toFixed(2)}% Done`);
    res.set('Retry-After', 120);
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
