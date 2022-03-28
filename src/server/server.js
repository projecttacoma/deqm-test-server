const axios = require('axios');
const { Server } = require('@projecttacoma/node-fhir-server-core');
const configBulkImport = require('../controllers/import.controller');
const configTransaction = require('../controllers/bundle.controller');
const configBulkStatus = require('../controllers/bulkstatus.controller');
const configClientFile = require('../controllers/clientfile.controller');
const { validateFhir } = require('../util/resourceValidationUtils');
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
  async enableValidationMiddleWare() {
    await axios.put('http://localhost:4567/igs/hl7.fhir.us.qicore');
    this.app.put('*', validateFhir);
    this.app.post('*', validateFhir);
    return this;
  }
}

async function initialize(config, app) {
  let server = new DEQMServer(config, app);

  if (process.env.VALIDATE) {
    server = await server.enableValidationMiddleWare();
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

module.exports = { DEQMServer, initialize };
