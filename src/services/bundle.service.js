const path = require('path');
const axios = require('axios').default;
const { ServerError, loggers, resolveSchema } = require('@asymmetrik/node-fhir-server-core');
const { v4: uuidv4 } = require('uuid');
let logger = loggers.get('default');

/**
 * Creates transaction-response Bundle
 * @param {*} results - request results
 * @param {*} res - an object containing the response
 * @param {*} type - bundle type
 * @returns transaction-response Bundle
 */
const makeTransactionResponseBundle = (results, res, baseVersion, type) => {
  const Bundle = resolveSchema(baseVersion, 'bundle');
  let bundle = new Bundle({ type: type, id: uuidv4() });
  bundle.link = {
    url: `${res.req.protocol}://${path.join(res.req.get('host'), res.req.baseUrl)}`,
    relation: 'self'
  };

  let entries = [];
  results.forEach(result => {
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
  return bundle;
};

/**
 * Supports Bundle upload to the server using transaction
 * @param {*} req - an object containing the request body
 * @param {*} res - an object containing the response
 * @returns transaction-response bundle
 */
async function uploadTransactionBundle(req, res) {
  console.log(req);
  //console.log(res);
  logger.info('Base >>> transaction');
  let { resourceType, type, entry: entries } = req.body;
  let { base_version: baseVersion } = req.params;
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
  let { protocol, baseUrl } = req;

  let requestsArray = entries.map(async entry => {
    let { url, method } = entry.request;
    let destinationUrl = `${protocol}://${path.join(req.headers.host, baseUrl, baseVersion, url)}`;
    return await axios[method.toLowerCase()](destinationUrl, entry.resource, {
      headers: { 'Content-Type': 'application/json+fhir' }
    });
  });
  const requestResults = await Promise.all(requestsArray);
  let resultsBundle = makeTransactionResponseBundle(requestResults, res, baseVersion, 'transaction-response');
  return resultsBundle;
}

module.exports = { uploadTransactionBundle };
