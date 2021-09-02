const { Server } = require('@asymmetrik/node-fhir-server-core');
const configTransaction = require('../services/bundle.controller');

class DEQMServer extends Server {
  enableTransactionRoute() {
    this.app.post('/:base_version/', configTransaction.transaction);
    // return self for chaining
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
    .setProfileRoutes()
    .setErrorRoutes();
}

module.exports = { DEQMServer, initialize };
