const { Server } = require('@projecttacoma/node-fhir-server-core');
const configBulkImport = require('../controllers/import.controller');
const configTransaction = require('../controllers/bundle.controller');
const configBulkStatus = require('../controllers/bulkstatus.controller');
const configClientFile = require('../controllers/clientfile.controller');

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
    this.app.get('/:base_version/:clientId/:fileName', configClientFile.clientFile);
    return this;
  }
}

function initialize(config, app) {
  return new DEQMServer(config, app)
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
}

module.exports = { DEQMServer, initialize };
