const axios = require('axios');
const { Server } = require('@projecttacoma/node-fhir-server-core');
const configBulkImport = require('../controllers/import.controller');
const configTransaction = require('../controllers/bundle.controller');
const configBulkStatus = require('../controllers/bulkstatus.controller');
const configClientFile = require('../controllers/clientfile.controller');
const { BadRequestError } = require('../util/errorUtils');
const { calculate } = require('fqm-execution/build/calculation/Calculator');

class DEQMServer extends Server {
  enableTransactionRoute() {
    this.app.post('/:base_version/', configTransaction.transaction);
    // return self for chaining
    return this;
  }
  enableBulkStatusRoute() {
    this.app.get('/:base_version/bulkstatus/:client_id', configBulkStatus.bulkstatus);
    return this;
  }
  enableImportRoute() {
    this.app.post('/:base_version/([$])import/', configBulkImport.bulkImport);
    return this;
  }
  enableClientFileRoute() {
    this.app.get('/:base_version/file/:clientId/:fileName', configClientFile.clientFile);
    return this;
  }
  enableValidationMiddleWare() {
    this.app.put('*', validateFhir);
    this.app.post('*', validateFhir);
    return this;
  }
}

function initialize(config, app) {
  let server = new DEQMServer(config, app);

  if (process.env.VALIDATE) {
    server = server.enableValidationMiddleWare();
  }
  server = server
    .configureMiddleware()
    .configureSession()
    .configureHelmet()
    .configurePassport()
    .setPublicDirectory()
    .enableTransactionRoute()
    .enableBulkStatusRoute()
    .enableImportRoute()
    .enableClientFileRoute()
    .setProfileRoutes()
    .setErrorRoutes();

  return server;
}

async function validateFhir(req, res, next) {
  const resourceType = retrieveResourceType(req.originalUrl);
  if (resourceType !== 'Calculation') {
    const validationUrl = `http://${process.env.VALIDATOR_HOST}:${process.env.VALIDATOR_PORT}/validate?profile=${resourceType}`;
    const response = await axios.post(validationUrl, req.body);
    if (response.data.issue[0].severity !== 'information') {
      res.status(400).json(response.data);
    } else {
      if (req.body?.meta?.profile && !req.body.meta.profile.includes(resourceType)) {
        req.body.meta.profile.push(resourceType);
      } else {
        req.body['meta'] = { profile: [resourceType] };
      }
      next();
    }
  } else {
    next();
  }
}
function retrieveResourceType(originalUrl) {
  const params = originalUrl.split('/');
  console.log(params);
  if (params[params.length - 1] === '$submit-data') {
    return 'Parameters';
  }
  // We don't need to validate posted Parameters bodies for dollar-sign operations since these aren't stored in the db
  if (params[params.length - 1][0] === '$') {
    return 'Calculation';
  }
  // Only param was base_version, so this is a transaction bundle upload
  if (params.length === 2) {
    return 'Bundle';
  }
  /*
   * If two or more params and not dollar-sign operation, third param must be the resourceType
   * keep in mind, the first param will always be the empty string since originalUrl starts with '/'
   */
  if (params.length > 2) {
    return params[2];
  }
}

module.exports = { DEQMServer, initialize };
