// Turns off the loggers for running tests
const { loggers } = require('@projecttacoma/node-fhir-server-core');

loggers.initialize();
const logger = loggers.get('default');

logger.transports[0].silent = true; // turns off
