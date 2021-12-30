const { ServerError } = require('@projecttacoma/node-fhir-server-core');
const fs = require('fs');

/**
 * Finds and responds with requested file for some client id
 * @param {Object} req The express request object passed in by the user
 * @param {Object} res The express response object to be returned to the user
 * @returns {Object} file content
 */
async function getClientFile(req, res) {
  const clientId = req.params.clientId;
  const fileName = req.params.fileName;
  const filePath = `tmp/${clientId}/${fileName}`;
  if (fs.existsSync(filePath)) {
    const readStream = fs.createReadStream(`tmp/${clientId}/${fileName}`);
    const extension = fileName.split(".").pop();
    // if (req.get('Content-Type')!== 'ndjson+fhir') -> TODO: do we want to check request Content-Type
    if (extension !== 'ndjson'){
      throw new ServerError(null, {
        statusCode: 400,
        issue: [
          {
            severity: 'error',
            code: 'not-supported',
            details: {
              text: `The following file extension is not currently supported: ${extension}`
            }
          }
        ]
      });
    }
    // TODO: check file type requested is ndjson (other cases change Content-type below)
    res.status(200);
    res.set('Content-Type', 'application/ndjson+fhir');
    return readStream;
  } else {
    throw new ServerError(null, {
      statusCode: 404,
      issue: [
        {
          severity: 'error',
          code: 'not-found',
          details: {
            text: `The following file was not found: ${clientId}/${fileName}`
          }
        }
      ]
    });
  }
  
}


module.exports = { getClientFile };
