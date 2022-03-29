const Queue = require('bee-queue');
const { AsyncPatientSource } = require('cql-exec-fhir');
const { Calculator } = require('fqm-execution');
const logger = require('./logger');
const mongoUtil = require('../database/connection');
const { getMeasureBundleFromId } = require('../util/bundleUtils');

logger.info(`exec-worker-${process.pid}: Execution Worker Started!`);
const execQueue = new Queue('exec', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

// Hold measure bundles for quick reuse indexed by id with { timeLoaded, bundle }
const measureBundleCache = {};

// Gets a measure bundle from either mongo or cache
async function getMeasureBundle(measureId) {
  // first check in cache if it has been more than 20seconds dump it.
  const cachedBundle = measureBundleCache[measureId];
  if (cachedBundle != null) {
    if (Date.now() - cachedBundle.timeLoaded > 20000) {
      // Wipe out if older than 20 seconds and let the mongo load repopulate it
      delete measureBundleCache[measureId];
      logger.info(`exec-worker-${process.pid}: Wiping ${measureId} from cache.`);
    } else {
      logger.info(`exec-worker-${process.pid}: Using ${measureId} from cache.`);
      return cachedBundle.bundle;
    }
  }

  // load from mongo
  logger.info(`exec-worker-${process.pid}: Loading ${measureId} from mongo.`);
  await mongoUtil.client.connect();
  const measureBundle = await getMeasureBundleFromId(measureId);
  measureBundleCache[measureId] = {
    timeLoaded: Date.now(),
    bundle: measureBundle
  };
  return measureBundle;
}

execQueue.process(async job => {
  logger.info(`exec-worker-${process.pid}: Execution Job Received!`);
  const measureBundle = await getMeasureBundle(job.data.measureId);

  const patientSource = AsyncPatientSource.FHIRv401('http://localhost:3000/4_0_1/');
  patientSource.loadPatientIds(job.data.patientIds);
  const results = await Calculator.calculate(measureBundle, [], {
    verboseCalculationResults: false,
    patientSource: patientSource,
    measurementPeriodStart: job.data.periodStart,
    measurementPeriodEnd: job.data.periodEnd
  });
  return results;
});
