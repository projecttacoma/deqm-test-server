const { initialize, loggers, Server } = require('@asymmetrik/node-fhir-server-core');
const mongoUtil = require('./util/mongo');
const { buildConfig } = require('./util/config');
const configTransaction = require('./services/bundle.controller');
//const express = require('express');

//const app = express();
//app.post('/:base_version/', configTransaction.transaction);

let config = buildConfig();
//let server = initialize(config, app);
//let server = initialize(config);
let server = new Server(config);
let logger = loggers.get('default');

server.configureMiddleware().configureSession().configureHelmet().configurePassport().setPublicDirectory();

server.app.post('/:base_version/', configTransaction.transaction);

server.setProfileRoutes().setErrorRoutes();

// set up custom route with base version as url

server.listen(3000, async () => {
  logger.info('Starting the FHIR Server at localhost:3000');
  await mongoUtil.client.connect();
  logger.info('Connected to database');
});
