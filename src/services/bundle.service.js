const path = require('path');
//const request = require('superagent');
const { ServerError, loggers } = require('@asymmetrik/node-fhir-server-core');
let logger = loggers.get('default');

/**
 * Support upload of a Bundle to the server using transaction.
 * @param {*} req - an object containing the request body
 */
async function uploadTransactionBundle(req) {
  console.log('are we here');
  console.log(req.body);
  console.log(req.params);
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

  let results = [];

  let requestsArray = entries.map(async entry => {
    let { url, method } = entry.request;
    //let resource = entry.resource;
    let destinationUrl = `${protocol}://${path.join(req.headers.host, baseUrl, baseVersion, url)}`;
    results.push({
      method: method,
      url: destinationUrl
    });
    // note - change request import to something else
    // want to send to base url with no resource type
    // want to send ind requests to the resource types
    // method - POST/PUT
    // might need to change destinationUrl assembly
    console.log(destinationUrl);
    return []; //request[method.toLowerCase()](destinationUrl).send(resource).set('Content-Type', 'application/json+fhir');
  });

  const requestResults = await Promise.all(requestsArray);

  return requestResults;
}

module.exports = { uploadTransactionBundle };
