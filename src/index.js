const { loggers } = require('@projecttacoma/node-fhir-server-core');
const express = require('express');
const mongoUtil = require('./database/connection');
const { buildConfig } = require('./config/profileConfig');
const { initialize } = require('./server/server');
const childProcess = require('child_process');

const app = express();
app.use(express.json({ limit: '50mb', type: 'application/json+fhir' }));
app.use(express.json({ limit: '50mb', type: 'application/fhir+json' }));

const config = buildConfig();
const server = initialize(config, app);
const logger = loggers.get('default');

for (let i = 0; i < process.env.IMPORT_PROCESSORS; i++) {
  childProcess.fork('./src/server/bulkDataProcessor.js');
}

server.listen(3000, async () => {
  logger.info('Starting the FHIR Server at localhost:3000');
  await mongoUtil.client.connect();
  logger.info('Connected to database');
});
