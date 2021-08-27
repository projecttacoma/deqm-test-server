const { initialize, loggers } = require('@asymmetrik/node-fhir-server-core');
const mongoUtil = require('./util/mongo');
const { buildConfig } = require('./util/config');

let config = buildConfig();
let server = initialize(config);
let logger = loggers.get('default');

server.listen(3000, async () => {
  logger.info('Starting the FHIR Server at localhost:3000');
  await mongoUtil.client.connect();
  logger.info('Connected to database');
});
