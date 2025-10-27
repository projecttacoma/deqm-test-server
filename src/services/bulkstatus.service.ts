import { getBulkImportStatus, getNdjsonFileStatus } from '../database/dbOperations';
import logger from '../server/logger';
import { NotFoundError } from '../util/errorUtils';
const fs = require('fs');
const path = require('path');

interface OutputFileItem {
  extension: ManifestUrlExtension;
  type?: string; // making this optional for now, not using types in the success outputs yet
  url: string;
}

interface ErrorFileItem {
  extension: ErrorManifestUrlExtension;
  url: string;
}

interface CountSeverity {
  success: Number;
  error: Number;
}

interface ErrorManifestUrlExtension extends ManifestUrlExtension {
  countSeverity?: CountSeverity;
}

interface ManifestUrlExtension {
  manifestUrl: string;
}
interface SubmissionIdExtension {
  submissionId: string;
}

// See https://build.fhir.org/ig/HL7/bulk-data/export.html#response---output-manifest
// need an extension for submissionId
// maybe need one for manifestUrl
export interface ExportManifest {
  transactionTime: Date; // FHIR Instant?
  extension: SubmissionIdExtension;
  request?: string; // I am not sure if this is needed and if so, what would we populate it with?
  requiresAccessToken?: boolean; // unclear if necessary
  organizedOutputBy?: string; // required when organizeOutputBy was populated, unclear if necessary
  output: OutputFileItem[]; // JSON array?
  error: ErrorFileItem[]; // just says Array ?? But example shows object with type and url
}

export async function checkBulkStatus(req: any, res: any) {
  const clientId: string = req.params.client_id;
  logger.debug(`Retrieving bulkStatus entry for client: ${clientId}`);
  const bulkStatus = await getBulkImportStatus(clientId);
  const submissionId = clientId.split('-')[1];

  if (!bulkStatus) {
    // we want to throw an error that it would not find the bulk import request with id
    throw new NotFoundError(`Could not find bulk import request with id: ${clientId}`);
  }

  // We need to build the export manifest with a TS type that we define since it is not a
  // FHIR resource. See https://build.fhir.org/ig/HL7/bulk-data/export.html#response---output-manifest
  const exportManifest: ExportManifest = {
    transactionTime: new Date(),
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
              text: bulkStatus.error.message ?? "Internal System Error: '$import' request not processed."
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
      url: `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/file/${clientId}/errors.ndjson`
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
          ndjsonStatus.failedOutcomes.forEach((fail: any) => {
            operationOutcomesOutput.push({
              resourceType: 'OperationOutcome',
              issue: [
                {
                  severity: 'error',
                  code: 'processing',
                  details: { text: fail }
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
        url: `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/file/${clientId}/errors.ndjson`
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
            ]
          });
        }
      }

      writeToFile(operationOutcomesOutput, clientId, true);

      exportManifest.output.push({
        extension: {
          manifestUrl: bulkStatus.manifestUrl
        },
        url: `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/file/${clientId}/output.ndjson`
      });
    }

    return exportManifest;
  }
}

const writeToFile = function (doc: any, clientId: string, success: boolean) {
  let dirpath = './tmp/' + clientId;
  fs.mkdirSync(dirpath, { recursive: true });
  const filename = success ? path.join(dirpath, 'output.ndjson') : path.join(dirpath, 'errors.ndjson');

  let lineCount = 0;
  if (Object.keys(doc).length > 0) {
    const stream = fs.createWriteStream(filename, { flags: 'a' });
    stream.write((++lineCount === 1 ? '' : '\r\n') + JSON.stringify(doc));
    stream.end();
  } else return;
};
