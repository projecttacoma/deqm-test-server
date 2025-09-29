// Turns off the loggers for running tests
import logger from '../src/server/logger';

logger.transports[0].silent = true; // turns off
