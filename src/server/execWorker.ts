//@ts-nocheck 
const Queue = require('bee-queue');
const { Calculator } = require('fqm-execution');
const logger = require('./logger');
const mongoUtil = require('../database/connection');
const { getMeasureBundleFromId } = require('../util/bundleUtils');
const { getPatientDataCollectionBundle } = require('../util/patientUtils');
const { PatientSource: MongoPatientSource } = require('cql-exec-fhir-mongo');

logger.info(`exec-worker-${process.pid}: Execution Worker Started!`);
const execQueue = new Queue('exec', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true
});

/**
 * Hold measure bundles and dataRequirements for quick reuse indexed by `id-periodStart-periodEnd with fields
 *  { lastUsed, bundle, dataReq }
 */
const measureBundleCache = {};

/**
 * Gets a measure bundle and data requirements from either mongo or cache. When storing or using from cache, the
 * `lastUsed` field is updated to the current time. If it has been longer than 20seconds remove it from cache and
 * fetch and calculate data requirements again.
 *
 * @param {string} measureId Resource id of measure.
 * @param {string} periodStart Measurement period start.
 * @param {string} periodEnd Measurement period end.
 * @returns {object} Object with measureBundle and dataReqs.
 */
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

/**
 * Maps array of patient IDs from execution jobs into patient data passed in to fqm-execution.
 * Either constructs and returns a patient source, or bundles of patient data to be passed in directly
 *
 * @param {string[]} patientIds list of patient IDs to resolve
 * @param {Bundle} measureBundle Bundle of measure data used for calculation
 * @return {MongoPatientSource | Bundle[]}
 */
async function resolvePatients(patientIds, measureBundle) {
  if (process.env.SCALED_EXEC_STRATEGY === 'mongo') {
    logger.info('Using MongoDB-based PatientSource for scaled calculation');
    const patientSource = MongoPatientSource.FHIRv401(mongoUtil.db);
    patientSource.loadPatientIds(patientIds);
    return patientSource;
  } else {
    logger.info('Using collection Bundles for scaled calculation');
    const patientBundlePromises = patientIds.map(async id => {
      return getPatientDataCollectionBundle(id, measureBundle.dataReq.results.dataRequirement);
    });
    return Promise.all(patientBundlePromises);
  }
}

execQueue.process(async job => {
  logger.info(`exec-worker-${process.pid}: Execution Job Received!`);
  const measureBundle = await getMeasureBundle(job.data.measureId, job.data.periodStart, job.data.periodEnd);
  const patients = await resolvePatients(job.data.patientIds, measureBundle);

  let res;
  const options = {
    verboseCalculationResults: false,
    measurementPeriodStart: job.data.periodStart,
    measurementPeriodEnd: job.data.periodEnd
  };

  // Resolution came back as raw patient bundles
  if (Array.isArray(patients)) {
    // Execute and return simple calculation results
    res = await Calculator.calculate(measureBundle.bundle, patients, options);
  } else {
    // Results came back as PatientSource instance
    res = await Calculator.calculate(measureBundle.bundle, [], {
      ...options,
      patientSource: patients
    });
  }

  return { calcResult: res, jobInfo: job.data };
});

process.on('exit', exitHandler);
process.on('SIGINT', exitHandler);
process.on('SIGTERM', exitHandler);

let stopping = false;
function exitHandler() {
  if (!stopping) {
    stopping = true;
    logger.info(`exec-worker-${process.pid}: Execution Worker Stopping`);
    process.exit();
  }
}

module.exports = execQueue;
