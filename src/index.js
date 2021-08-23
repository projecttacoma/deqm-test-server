const { initialize, loggers, constants } = require('@asymmetrik/node-fhir-server-core');
const mongoUtil = require('./util/mongo');
const { VERSIONS } = constants;

let config = {
  profiles: {
    patient: {
      service: './services/patient.service.js',
      versions: [VERSIONS['4_0_0']]
    }
  }
};
let server = initialize(config);
let logger = loggers.get('default');

server.listen(3000, async () => {
  logger.info('Starting the FHIR Server at localhost:3000');
  await mongoUtil.client.connect();
  logger.info('Connected to database');
});
