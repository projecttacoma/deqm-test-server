const { Server } = require('@projecttacoma/node-fhir-server-core');
const configTransaction = require('../services/bundle.controller');
const configBulkStatus = require('../services/bulkstatus.controller');

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
    .setProfileRoutes()
    .setErrorRoutes();
}

module.exports = { DEQMServer, initialize };
