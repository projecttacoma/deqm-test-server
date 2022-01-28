const { loggers } = require('@projecttacoma/node-fhir-server-core');
const express = require('express');
const mongoUtil = require('./database/connection');
const { decrementBulkFileCount, updateSuccessfulImportCount } = require('./database/dbOperations');
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

const workerTotal = parseInt(process.env.IMPORT_WORKERS) + parseInt(process.env.NDJSON_WORKERS);

if (workerTotal > os.cpus().length) {
  console.warn(`WARNING: Requested to start ${workerTotal} workers with only ${os.cpus().length} available cpus`);
}

for (let i = 0; i < process.env.IMPORT_WORKERS; i++) {
  childProcess.fork('./src/server/importWorker.js');
}

for (let i = 0; i < process.env.NDJSON_WORKERS; i++) {
  const child = childProcess.fork('./src/server/ndjsonWorker.js');

  // Database updates need to happen from the main process to avoid race conditions
  child.on('message', async ({ clientId, resourceCount, successCount }) => {
    await decrementBulkFileCount(clientId, resourceCount);
    await updateSuccessfulImportCount(clientId, successCount);
  });
}

const port = process.env.SERVER_PORT || 3000;

server.listen(port, async () => {
  logger.info(`Starting the FHIR Server at localhost:${port}`);
  await mongoUtil.client.connect();
  logger.info('Connected to database');
});
