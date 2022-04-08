const Queue = require('bee-queue');
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

// Hold measure bundles and dataRequirements for quick reuse indexed by id-MPstart-MPend with { lastUsed, bundle, dataReq }
const measureBundleCache = {};

// Gets a measure bundle from either mongo or cache
async function getMeasureBundle(measureId, periodStart, periodEnd) {
  const cacheLabel = `${measureId}-${periodStart}-${periodEnd}`;
  // first check in cache if it has been more than 20seconds dump it.
  const cachedBundle = measureBundleCache[cacheLabel];
  if (cachedBundle != null) {
    if (Date.now() - cachedBundle.lastUsed > 20000) {
      // Wipe out if older than 20 seconds and let the mongo load repopulate it
      delete measureBundleCache[cacheLabel];
      logger.info(`exec-worker-${process.pid}: Wiping ${cacheLabel} from cache.`);
    } else {
      logger.info(`exec-worker-${process.pid}: Using ${cacheLabel} from cache.`);
      cachedBundle.lastUsed = Date.now();
      return cachedBundle;
    }
  }

  // load from mongo
  logger.info(`exec-worker-${process.pid}: Loading ${cacheLabel} from mongo.`);
  await mongoUtil.client.connect();
  const measureBundle = await getMeasureBundleFromId(measureId);
  measureBundleCache[cacheLabel] = {
    lastUsed: Date.now(),
    bundle: measureBundle,
    dataReq: await Calculator.calculateDataRequirements(measureBundle, {
      measurementPeriodStart: periodStart,
      measurementPeriodEnd: periodEnd
    })
  };
  return measureBundleCache[cacheLabel];
}

execQueue.process(async job => {
  logger.info(`exec-worker-${process.pid}: Execution Job Received!`);
  const measureBundle = await getMeasureBundle(job.data.measureId, job.data.periodStart, job.data.periodEnd);

  let patientBundles = job.data.patientIds.map(async id => {
    return getPatientDataCollectionBundle(id, measureBundle.dataReq.results.dataRequirement);
  });
  patientBundles = await Promise.all(patientBundles);
  return await Calculator.calculate(measureBundle.bundle, patientBundles, {
    verboseCalculationResults: false,
    measurementPeriodStart: job.data.periodStart,
    measurementPeriodEnd: job.data.periodEnd
  });
});

module.exports = execQueue;
