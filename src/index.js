const { loggers } = require('@asymmetrik/node-fhir-server-core');
const mongoUtil = require('./util/mongo');
const { buildConfig } = require('./util/config');
const { initialize } = require('./server/server');
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json({ limit: '50mb', type: 'application/json+fhir' }));

let config = buildConfig();
let server = initialize(config, app);
let logger = loggers.get('default');

server.listen(3000, async () => {
  logger.info('Starting the FHIR Server at localhost:3000');
  await mongoUtil.client.connect();
  logger.info('Connected to database');
});
