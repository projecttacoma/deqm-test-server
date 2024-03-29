const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { resolveSchema } = require('@projecttacoma/node-fhir-server-core');
const { BadRequestError } = require('../util/errorUtils');
const { replaceReferences } = require('../util/bundleUtils');
const { checkProvenanceHeader, populateProvenanceTarget } = require('../util/provenanceUtils');
const { createResource, pushToResource, updateResource } = require('../database/dbOperations');
const { createAuditEventFromProvenance } = require('../util/provenanceUtils');
const { checkSupportedResource, checkContentTypeHeader } = require('../util/baseUtils');
const logger = require('../server/logger');

/**
 * Creates transaction-response Bundle
 * @param {Array} results - an array of request result objects
 * @param {Object} res - an object containing the response
 * @param {string} baseVersion - base version of FHIR
 * @param {string} type - bundle type
 * @param {boolean} xprovenanceIncluded - X-Provenance header was included and
 * should be accounted for
 * @returns {Object} transaction-response Bundle and updated txn bundle target (may be empty)
 */
const makeTransactionResponseBundle = (results, res, baseVersion, type, xprovenanceIncluded) => {
  logger.info('Compiling transaction response bundle');
  logger.debug(`Transaction response bundle results: ${JSON.stringify(results)}`);
  const Bundle = resolveSchema(baseVersion, 'bundle');
  const bundle = new Bundle({ type: type, id: uuidv4() });
  bundle.link = {
    url: `${res.req.protocol}://${path.join(res.req.get('host'), res.req.baseUrl)}`,
    relation: 'self'
  };

  const entries = [];
  // array of reference objects from each resource
  const bundleProvenanceTarget = [];
  logger.debug(`Transaction response bundle results: ${JSON.stringify(results)}`);
  results.forEach(result => {
    logger.debug(`Processing upload result: ${JSON.stringify(result)}`);
    const entry = new Bundle({ response: { status: `${result.status} ${result.statusText}` } });
    if (result.status === 200 || result.status === 201) {
      if (xprovenanceIncluded) {
        const provTarget = { reference: `${result.resource.resourceType}/${result.resource.id}` };
        logger.debug(`Pushing to bundle provenance target: ${JSON.stringify(provTarget)}`);
        bundleProvenanceTarget.push(provTarget);
      }

      entry.response.location = `${baseVersion}/${result.resource.resourceType}/${result.resource.id}`;
    } else {
      entry.response.outcome = result.data;
    }
    entries.push(entry);
  });

  bundle.entry = entries;
  logger.info('Completed transaction response bundle');
  return { bundle, bundleProvenanceTarget: bundleProvenanceTarget };
};

/**
 * Handles transaction bundles used for submit data.
 * Creates an audit event and uploads the transaction bundles.
 * @param {Array} transactionBundles - an array of transactionBundles to handle
 * @param {Object} req - an object containing the request body
 * @returns {Array} array of transaction-response bundle
 */
async function handleSubmitDataBundles(transactionBundles, req) {
  logger.info('Handling submit data bundles');
  logger.debug(`Request params: ${JSON.stringify(req.params)}`);
  logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);

  let auditID;
  const { base_version: baseVersion } = req.params;
  if (req.headers['x-provenance']) {
    checkProvenanceHeader(req.headers);
    const auditEvent = createAuditEventFromProvenance(req.headers['x-provenance'], baseVersion);
    logger.info(`Creating AuditEvent resource`);
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

      const entities = bundleResponse.entry
        .filter(entry => {
          return entry.response.status === '200 OK' || entry.response.status === '201 Created';
        })
        .map(entry => {
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
 * @param {Object} req - an object containing the request body
 * @param {Object} res - an object containing the response
 * @returns {Object} transaction-response bundle
 */
async function uploadTransactionBundle(req, res) {
  logger.info('Base >>> transaction');
  const { resourceType, type, entry: entries } = req.body;
  const { base_version: baseVersion } = req.params;
  const { headers } = req;
  logger.debug(`Request params: ${JSON.stringify(req.params)}`);
  logger.debug(`Request body: ${JSON.stringify(req.body)}`);
  logger.debug(`Request headers: ${JSON.stringify(req.headers)}`);

  checkContentTypeHeader(headers);
  // TODO: we will need to somehow store all data that is uploaded, even if it's bad data
  if (resourceType !== 'Bundle') {
    throw new BadRequestError(`Expected 'resourceType: Bundle', but received 'resourceType: ${resourceType}'.`);
  }
  if (type.toLowerCase() !== 'transaction') {
    throw new BadRequestError(`Expected 'type: transaction'. Received 'type: ${type}'.`);
  }
  let xprovenanceIncluded;
  if (req.headers['x-provenance']) {
    checkProvenanceHeader(req.headers);
    xprovenanceIncluded = true;
  }
  const requestResults = await uploadResourcesFromBundle(entries, baseVersion);

  const { bundle, bundleProvenanceTarget } = makeTransactionResponseBundle(
    requestResults,
    res,
    baseVersion,
    'transaction-response',
    xprovenanceIncluded
  );
  if (xprovenanceIncluded && bundleProvenanceTarget.length > 0) {
    populateProvenanceTarget(headers, res, bundleProvenanceTarget);
  }
  logger.info('Transaction bundle successfully uploaded.');
  return bundle;
}

/**
 * Supports Bundle upload to the server using transaction
 * @param {Object} entries - an object containing the list of entries in the bundle to process
 * @param {string} baseVersion base version from args passed in through client request
 * @returns {Object} an array of results that containing the results of the mongo insertions
 */
async function uploadResourcesFromBundle(entries, baseVersion) {
  logger.info('Inserting resources from transaction bundle');
  const scrubbedEntries = replaceReferences(entries);

  logger.debug(`Attempting to upload bundle resources: ${JSON.stringify(entries)}`);
  const requestsArray = scrubbedEntries.map(async entry => {
    const { method } = entry.request;
    return insertBundleResources(entry, method).catch(e => {
      const operationOutcome = resolveSchema(baseVersion, 'operationoutcome');
      const results = new operationOutcome();
      results.issue = e.issue;
      results.statusCode = e.statusCode;
      return {
        status: e.statusCode,
        statusCode: e.statusCode,
        statusText: e.issue[0].code,
        data: results.toJSON()
      };
    });
  });
  const requestResults = await Promise.all(requestsArray);
  return requestResults;
}

/**
 * Supports Bundle upload to the server using transaction
 * @param {Object} entry - an object from the TB to insert to the database
 * @param {string} method - The method of the request, currently on PUT or POST are supported
 * @returns {Object} an object containing the results of a mongo insertion or update for the
 * specified entry
 */
async function insertBundleResources(entry, method) {
  logger.debug(`Using ${method} method to insert entry: ${entry}`);
  checkSupportedResource(entry.resource.resourceType);
  if (method === 'POST') {
    entry.resource.id = uuidv4();
    const { id } = await createResource(entry.resource, entry.resource.resourceType);
    if (id != null) {
      entry.status = 201;
      entry.statusText = 'Created';
    }
  }
  if (method === 'PUT') {
    const { id, created } = await updateResource(entry.resource.id, entry.resource, entry.resource.resourceType);
    if (created === true) {
      entry.status = 201;
      entry.statusText = 'Created';
    } else if (id != null && created === false) {
      entry.status = 200;
      entry.statusText = 'OK';
    }
  } else {
    throw new BadRequestError(
      `Expected requests of type PUT or POST, received ${method} for ${entry.resource.resourceType}/${entry.resource.id}`
    );
  }
  return entry;
}
module.exports = { uploadTransactionBundle, handleSubmitDataBundles, uploadResourcesFromBundle };
