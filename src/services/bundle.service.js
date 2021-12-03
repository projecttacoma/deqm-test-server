const path = require('path');
const axios = require('axios').default;
const { ServerError, loggers, resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');
const { replaceReferences } = require('../util/bundleUtils');
const { checkProvenanceHeader, populateProvenanceTarget } = require('../util/provenanceUtils');
const { createResource, pushToResource } = require('../util/mongo.controller');
const { createAuditEventFromProvenance } = require('../util/provenanceUtils');

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
 * Handles transaction bundles used for submit data.
 * Creates an audit event and uploads the transaction bundles.
 * @param {Array} transactionBundles - an array of transactionBundles to handle
 * @param {Object} req - an object containing the request body
 * @returns array of transaction-response bundle
 */
async function handleSubmitDataBundles(transactionBundles, req) {
  let auditID;
  const { base_version: baseVersion } = req.params;
  if (req.headers['x-provenance']) {
    checkProvenanceHeader(req.headers);
    const auditEvent = createAuditEventFromProvenance(req.headers['x-provenance'], baseVersion);
    auditID = (await createResource(auditEvent, 'AuditEvent')).id;
  }
  const tbTemplate = resolveSchema(baseVersion, 'bundle');
  // upload transaction bundles and add resources to auditevent from those successfully uploaded
  return transactionBundles.map(async tb => {
    // Check upload succeeds
    tb = new tbTemplate(tb);
    req.body = tb.toJSON();
    const bundleResponse = await uploadTransactionBundle(req, req.res);

    if (auditID) {
      // save resources to the AuditEvent
      const entities = bundleResponse.entry.map(entry => {
        return { what: { reference: entry.response.location.replace(`${baseVersion}/`, '') } };
      });
      // use $each to push multiple
      await pushToResource(auditID, { entity: { $each: entities } }, 'AuditEvent');
    }
    return bundleResponse;
  });
}

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
  // TODO: we will need to somehow store all data that is uploaded, even if it's bad data
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

module.exports = { uploadTransactionBundle, handleSubmitDataBundles };
