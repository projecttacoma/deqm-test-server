const { initialize, loggers } = require('@asymmetrik/node-fhir-server-core');

let config = {};
let server = initialize(config);
let logger = loggers.get('default');

server.listen(3000, () => {
  logger.info('Starting the FHIR Server at localhost:3000');
});
