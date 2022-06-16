const { Server } = require('@projecttacoma/node-fhir-server-core');
const cors = require('cors');
const configBulkImport = require('../controllers/import.controller');
const configTransaction = require('../controllers/bundle.controller');
const configBulkStatus = require('../controllers/bulkstatus.controller');
const configClientFile = require('../controllers/clientfile.controller');
const configResourceCount = require('../controllers/resourcecount.controller');
const { validateFhir } = require('../util/resourceValidationUtils');
const logger = require('./logger.js');
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
    this.app.put('/:base_version*', validateFhir);
    this.app.post('/:base_version*', validateFhir);
    return this;
  }
  enableResourceCountRoute() {
    this.app.get('/:base_version/resourceCount/', configResourceCount.resourceCount);
    return this;
  }

  enableCors() {
    this.app.use(cors());
    return this;
  }
}

function initialize(config, app) {
  let server = new DEQMServer(config, app);

  if (process.env.VALIDATE === 'true') {
    logger.info('Configuring server to use FHIR profile validation');
    server = server.enableValidationMiddleWare();
  }
  server = server
    .enableCors()
    .configureMiddleware()
    .configureSession()
    .configureHelmet()
    .configurePassport()
    .setPublicDirectory()
    .enableTransactionRoute()
    .enableBulkStatusRoute()
    .enableImportRoute()
    .enableClientFileRoute()
    .enableResourceCountRoute()
    .setProfileRoutes()
    .setErrorRoutes();

  return server;
}

module.exports = { DEQMServer, initialize };
