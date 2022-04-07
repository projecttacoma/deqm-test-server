const Queue = require('bee-queue');
const { AsyncPatientSource } = require('cql-exec-fhir');
const { Calculator } = require('fqm-execution');
const logger = require('./logger');
const mongoUtil = require('../database/connection');
const { getMeasureBundleFromId } = require('../util/bundleUtils');
const { getPatientDataCollectionBundle } = require('../util/patientUtils');

logger.info(`exec-worker-${process.pid}: Execution Worker Started!`);
const execQueue = new Queue('exec', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

/**
 * Flag to run directly connecting to mongo for patient data. If false will use FHIR server interactions for fetching
 * patient data.
 */
const MONGO_PATIENTS = true;

// Hold measure bundles and dataRequirements for quick reuse indexed by id-MPstart-MPend with { timeLoaded, bundle, dataReq }
const measureBundleCache = {};

// Gets a measure bundle from either mongo or cache
async function getMeasureBundle(measureId, periodStart, periodEnd) {
  const cacheLabel = `${measureId}-${periodStart}-${periodEnd}`;
  // first check in cache if it has been more than 20seconds dump it.
  const cachedBundle = measureBundleCache[cacheLabel];
  if (cachedBundle != null) {
    if (Date.now() - cachedBundle.timeLoaded > 20000) {
      // Wipe out if older than 20 seconds and let the mongo load repopulate it
      delete measureBundleCache[cacheLabel];
      logger.info(`exec-worker-${process.pid}: Wiping ${cacheLabel} from cache.`);
    } else {
      logger.info(`exec-worker-${process.pid}: Using ${cacheLabel} from cache.`);
      return cachedBundle;
    }
  }

  // load from mongo
  logger.info(`exec-worker-${process.pid}: Loading ${cacheLabel} from mongo.`);
  await mongoUtil.client.connect();
  const measureBundle = await getMeasureBundleFromId(measureId);
  measureBundleCache[cacheLabel] = {
    timeLoaded: Date.now(),
    bundle: measureBundle
  };
  if (MONGO_PATIENTS) {
    measureBundleCache[cacheLabel].dataReq = await Calculator.calculateDataRequirements(measureBundle, {
      measurementPeriodStart: periodStart,
      measurementPeriodEnd: periodEnd
    });
  }
  return measureBundleCache[cacheLabel];
}

execQueue.process(async job => {
  logger.info(`exec-worker-${process.pid}: Execution Job Received!`);
  const measureBundle = await getMeasureBundle(job.data.measureId, job.data.periodStart, job.data.periodEnd);
  let results;
  if (MONGO_PATIENTS) {
    logger.info(`exec-worker-${process.pid}: Executing with reaching to mongo for patient bundles.`);
    let patientBundles = job.data.patientIds.map(async id => {
      return getPatientDataCollectionBundle(id, measureBundle.dataReq.results.dataRequirement);
    });
    patientBundles = await Promise.all(patientBundles);
    results = await Calculator.calculate(measureBundle.bundle, patientBundles, {
      verboseCalculationResults: false,
      measurementPeriodStart: job.data.periodStart,
      measurementPeriodEnd: job.data.periodEnd
    });
  } else {
    logger.info(`exec-worker-${process.pid}: Executing with reaching to FHIR server for patient data.`);
    const patientSource = AsyncPatientSource.FHIRv401(
      `http://${process.env.SERVER_HOST}:${process.env.SERVER_PORT}/4_0_1/`
    );
    patientSource.loadPatientIds(job.data.patientIds);
    results = await Calculator.calculate(measureBundle.bundle, [], {
      verboseCalculationResults: false,
      patientSource: patientSource,
      measurementPeriodStart: job.data.periodStart,
      measurementPeriodEnd: job.data.periodEnd
    });
  }
  return results;
});

module.exports = execQueue;
