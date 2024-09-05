const axios = require('axios');
const logger = require('./server/logger.js');
const express = require('express');
const mongoUtil = require('./database/connection');
const { decrementBulkFileCount, updateSuccessfulImportCount } = require('./database/dbOperations');
const { buildConfig } = require('./config/profileConfig');
const { initialize } = require('./server/server');
const childProcess = require('child_process');
const os = require('os');
const ndjsonQueue = require('./queue/ndjsonProcessQueue');

const app = express();
app.use(express.json({ limit: '50mb', type: 'application/json+fhir' }));
app.use(express.json({ limit: '50mb', type: 'application/fhir+json' }));

const config = buildConfig();
const server = initialize(config, app);
const workerProcesses = [];

const workerTotal =
  parseInt(process.env.IMPORT_WORKERS) + parseInt(process.env.NDJSON_WORKERS) + parseInt(process.env.EXEC_WORKERS);

if (workerTotal > os.cpus().length) {
  logger.warn(`WARNING: Requested to start ${workerTotal} workers with only ${os.cpus().length} available cpus`);
}

for (let i = 0; i < process.env.IMPORT_WORKERS; i++) {
  workerProcesses.push(childProcess.fork('./src/server/importWorker.js'));
}

for (let i = 0; i < process.env.EXEC_WORKERS; i++) {
  workerProcesses.push(childProcess.fork('./src/server/execWorker.js'));
}

for (let i = 0; i < process.env.NDJSON_WORKERS; i++) {
  workerProcesses.push(childProcess.fork('./src/server/ndjsonWorker.js'));
}
// Database updates need to happen from the main process to avoid race conditions for bulk status update
ndjsonQueue.on('job succeeded', async (jobId, { clientId, resourceCount, successCount }) => {
  logger.debug(`ndjson job ${jobId} succeeded`);
  try {
    await decrementBulkFileCount(clientId, resourceCount);
    await updateSuccessfulImportCount(clientId, successCount);
  } catch (e) {
    logger.info(`Error processing ndjson-worker message: ${e.message}`);
  }
});

const port = process.env.SERVER_PORT || 3000;

server.listen(port, async () => {
  logger.info(`Starting the FHIR Server at localhost:${port}`);
  await mongoUtil.client.connect();
  logger.info('Connected to database');
  if (process.env.VALIDATE === 'true') {
    await axios.put(`http://${process.env.VALIDATOR_HOST}:${process.env.VALIDATOR_PORT}/igs/hl7.fhir.us.qicore`);
    logger.info('Added qicore profiles to validator server');
  }
});

process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);

let stopping = false;
function exitHandler() {
  if (!stopping) {
    stopping = true;
    logger.info('Shuting down...');
    workerProcesses.forEach(worker => {
      worker.kill('SIGTERM');
    });
    setTimeout(() => {
      logger.info('Workers stopped... Goodbye!');
      process.exit();
    }, 2000);
  }
}
