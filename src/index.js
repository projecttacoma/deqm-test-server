const { loggers } = require('@projecttacoma/node-fhir-server-core');
const express = require('express');
const mongoUtil = require('./database/connection');
const { buildConfig } = require('./config/profileConfig');
const { initialize } = require('./server/server');
const childProcess = require('child_process');
const os = require('os');

const app = express();
app.use(express.json({ limit: '50mb', type: 'application/json+fhir' }));
app.use(express.json({ limit: '50mb', type: 'application/fhir+json' }));

const config = buildConfig();
const server = initialize(config, app);
const logger = loggers.get('default');

if (process.env.IMPORT_WORKERS > os.cpus().length) {
  console.warn(
    `WARNING: Requested to start ${process.env.IMPORT_WORKERS} workers with only ${os.cpus().length} available cpus`
  );
}

for (let i = 0; i < process.env.IMPORT_WORKERS; i++) {
  childProcess.fork('./src/server/importWorker.js');
}

server.listen(3000, async () => {
  logger.info('Starting the FHIR Server at localhost:3000');
  await mongoUtil.client.connect();
  logger.info('Connected to database');
});
