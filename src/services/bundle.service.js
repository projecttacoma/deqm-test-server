const path = require('path');
const axios = require('axios').default;
const { ServerError, loggers, resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');
const { replaceReferences } = require('../util/bundleUtils');
const { checkProvenanceHeader, populateProvenanceTarget } = require('../util/provenanceUtils');

const logger = loggers.get('default');

/**
 * Creates transaction-response Bundle
 * @param {*} results - request results
 * @param {*} res - an object containing the response
 * @param {*} type - bundle type
 * @param { boolean } xprovenanceIncluded - X-Provenance header was included and
 * should be accounted for
 * @returns transaction-response Bundle and updated txn bundle target (may be empty)
 */
const makeTransactionResponseBundle = (results, res, baseVersion, type, xprovenanceIncluded) => {
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
    if (xprovenanceIncluded) {
      bundleProvenanceTarget.push(JSON.parse(result.headers['x-provenance']).target);
    }
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
  let xprovenanceIncluded;
  if (req.headers['x-provenance']) {
    checkProvenanceHeader(req.headers);
    xprovenanceIncluded = true;
  }
  const { protocol, baseUrl } = req;
  const scrubbedEntries = replaceReferences(entries);
  // define headers to be included in axios call
  const entryHeaders = { 'Content-Type': 'application/json+fhir' };
  if (xprovenanceIncluded) {
    entryHeaders['X-Provenance'] = req.headers['x-provenance'];
  }
  const requestsArray = scrubbedEntries.map(async entry => {
    const { url, method } = entry.request;
    const destinationUrl = `${protocol}://${path.join(req.headers.host, baseUrl, baseVersion, url)}`;
    return axios[method.toLowerCase()](destinationUrl, entry.resource, {
      headers: entryHeaders
    });
  });
  const requestResults = await Promise.all(requestsArray);
  const { bundle, bundleProvenanceTarget } = makeTransactionResponseBundle(
    requestResults,
    res,
    baseVersion,
    'transaction-response',
    xprovenanceIncluded
  );
  if (xprovenanceIncluded && bundleProvenanceTarget.length > 0) {
    populateProvenanceTarget(req.headers, res, bundleProvenanceTarget);
  }
  return bundle;
}

module.exports = { uploadTransactionBundle };
