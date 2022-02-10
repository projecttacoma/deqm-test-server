// Turns off the loggers for running tests
const logger = require('../src/server/logger');

logger.transports[0].silent = true; // turns off
