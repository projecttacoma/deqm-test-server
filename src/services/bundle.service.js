const path = require('path');
const axios = require('axios').default;
const { ServerError, loggers, resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');
const { replaceReferences } = require('../util/bundleUtils');
const { checkProvenanceHeader, populateProvenanceTarget } = require('./base.service');

const logger = loggers.get('default');

/**
 * Creates transaction-response Bundle
 * @param {*} results - request results
 * @param {*} res - an object containing the response
 * @param {*} type - bundle type
 * @returns transaction-response Bundle and updated txn bundle response
 */
const makeTransactionResponseBundle = (results, res, baseVersion, type) => {
  const Bundle = resolveSchema(baseVersion, 'bundle');
  const bundle = new Bundle({ type: type, id: uuidv4() });
  bundle.link = {
    url: `${res.req.protocol}://${path.join(res.req.get('host'), res.req.baseUrl)}`,
    relation: 'self'
  };

  const entries = [];
  // array of reference objects from each resource
  const bundleProvenanceTarget = [];
  results.forEach(result => {
    bundleProvenanceTarget.push(JSON.parse(result.headers['x-provenance']).target);
    entries.push(
      new Bundle({
        response: {
          status: `${result.status} ${result.statusText}`,
          location: result.headers.location
        }
      })
    );
  });

  bundle.entry = entries;
  return { bundle, bundleProvenanceTarget: bundleProvenanceTarget.flat() };
};

/**
 * Supports Bundle upload to the server using transaction
 * @param {*} req - an object containing the request body
 * @param {*} res - an object containing the response
 * @returns transaction-response bundle
 */
async function uploadTransactionBundle(req, res) {
  logger.info('Base >>> transaction');
  const { resourceType, type, entry: entries } = req.body;
  const { base_version: baseVersion } = req.params;
  if (resourceType !== 'Bundle') {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected 'resourceType: Bundle', but received 'resourceType: ${resourceType}'.`
          }
        }
      ]
    });
  }
  if (type.toLowerCase() !== 'transaction') {
    throw new ServerError(null, {
      statusCode: 400,
      issue: [
        {
          severity: 'error',
          code: 'BadRequest',
          details: {
            text: `Expected 'type: transaction'. Received 'type: ${type}'.`
          }
        }
      ]
    });
  }
  checkProvenanceHeader(req.headers);
  const { protocol, baseUrl } = req;
  const scrubbedEntries = replaceReferences(entries);
  const requestsArray = scrubbedEntries.map(async entry => {
    const { url, method } = entry.request;
    const destinationUrl = `${protocol}://${path.join(req.headers.host, baseUrl, baseVersion, url)}`;
    return axios[method.toLowerCase()](destinationUrl, entry.resource, {
      headers: { 'Content-Type': 'application/json+fhir', 'X-Provenance': req.headers['x-provenance'] }
    });
  });
  const requestResults = await Promise.all(requestsArray);
  const { bundle, bundleProvenanceTarget } = makeTransactionResponseBundle(
    requestResults,
    res,
    baseVersion,
    'transaction-response'
  );
  populateProvenanceTarget(req.headers, res, bundleProvenanceTarget);
  return bundle;
}

module.exports = { uploadTransactionBundle };
