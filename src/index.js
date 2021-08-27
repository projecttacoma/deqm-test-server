const { loggers } = require('@asymmetrik/node-fhir-server-core');
const mongoUtil = require('./util/mongo');
const { buildConfig } = require('./util/config');
const { initialize } = require('./server/server');
const express = require('express');

const app = express();
app.use(express.json({ limit: '50mb', type: 'application/json+fhir' }));

let config = buildConfig();
let server = initialize(config, app);
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
