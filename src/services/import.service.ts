//@ts-nocheck
const { addPendingBulkImportRequest, failBulkImportRequest } = require('../database/dbOperations');
const { checkContentTypeHeader } = require('../util/baseUtils');
const axios = require('axios');
const importQueue = require('../queue/importQueue');
import logger from '../server/logger';

// Created from bulk export output manifest description:
// https://build.fhir.org/ig/HL7/bulk-data/export.html#response---output-manifest

export interface ExportManifest {
  transactionTime: string;
  request: string;
  requiresAccessToken: boolean;
  outputOrganizedBy: string;
  output: FileItem[];
  deleted?: FileItem[];
  error: FileItem[];
  link?: [{ relation: 'next'; url: string }];
  extension?: object;
}

export interface FileItem {
  url: string;
  type?: string; // may not be present when using organizeOutputBy
  continuesInFile?: string;
  count?: number;
}

/**
 * Executes an import of all the resources on the passed in server.
 * @param {Object} req The request object passed in by the client
 * @param {Object} res The response object returned to the client by the server
 */
async function bulkImport(req, res) {
  logger.info('Base >>> Import');
  logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  logger.debug(`Request params: ${JSON.stringify(req.params)}`);

  checkContentTypeHeader(req.headers);

  const submitter = req.body.parameter.find(p => p.name === 'submitter').valueIdentifier as fhir4.Identifier;
  const submissionId = req.body.parameter.find(p => p.name === 'submissionId').valueString;
  const manifestId = req.body.parameter.find(p => p.name === 'manifestId').valueString;
  const manifestUrl = req.body.parameter.find(p => p.name === 'manifestUrl').valueString;
  const baseUrl = req.body.parameter.find(p => p.name === 'FHIRBaseUrl').valueString;

  // TODO: handle fetch error
  const manifest = (await axios.get(manifestUrl)).data;
  console.log('Found manifest:', manifest);

  // ID assigned to the requesting client
  const clientEntry = `${submitter.value}-${submissionId}`;
  await addPendingBulkImportRequest(manifest, clientEntry, manifestId, baseUrl);

  try {
    const inputUrls = manifest.output.map(o => o.url);

    const jobData = {
      clientEntry,
      inputUrls
    };
    await importQueue.createJob(jobData).save();
  } catch (e) {
    await failBulkImportRequest(clientEntry, e);
  }

  res.status(202);
  res.setHeader(
    'Content-Location',
    `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/${req.params.base_version}/bulkstatus/${clientEntry}`
  );
  return;
}

module.exports = { bulkImport };
