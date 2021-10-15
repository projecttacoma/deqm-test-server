const { loggers } = require('@projecttacoma/node-fhir-server-core');
const express = require('express');
const mongoUtil = require('./util/mongo');
const { buildConfig } = require('./util/config');
const { initialize } = require('./server/server');

const app = express();
app.use(express.json({ limit: '50mb', type: 'application/json+fhir' }));
app.use(express.json({ limit: '50mb', type: 'application/fhir+json' }));

const config = buildConfig();
const server = initialize(config, app);
const logger = loggers.get('default');

server.listen(3000, async () => {
  logger.info('Starting the FHIR Server at localhost:3000');
  await mongoUtil.client.connect();
  logger.info('Connected to database');
});
