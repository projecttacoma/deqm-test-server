const { initialize, loggers, constants } = require('@asymmetrik/node-fhir-server-core');
const mongoUtil = require('./util/mongo');
const { VERSIONS } = constants;
const { buildServiceModule } = require('./services/base.service');

let config = {
  profiles: {
    patient: {
      service: buildServiceModule('Patient'),
      versions: [VERSIONS['4_0_0']]
    },
    observation: {
      service: buildServiceModule('Observation'),
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
