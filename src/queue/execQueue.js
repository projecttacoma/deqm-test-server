// Setup for exec queue which pushes jobs to Redis

const Queue = require('bee-queue');
const logger = require('../server/logger.js');
const { MeasureReportBuilder } = require('fqm-execution');

// Create a new queue to establish new Redis connection
const execQueue = new Queue('exec', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  removeOnSuccess: true,
  isWorker: false
});

execQueue.on('error', err => {
  logger.error('exec-queue error: ', err);
});

/**
 * Interface for running a scaled calculation.
 */
class ScaledCalculation {
  /**
   * Constructs a scaled calculation instance and prepares job data.
   *
   * @param {fhir4.Bundle[]} measureBundles Measure bundle resources
   * @param {string[]} patientIds Patient ids list.
   * @param {string} periodStart Start of measurement period
   * @param {string} periodEnd End of measurement period
   */
  constructor(measureBundles, patientIds, periodStart, periodEnd) {
    if (!(process.env.EXEC_WORKERS > 0)) {
      throw new Error('Scalable Calculation is disabled. To enable set EXEC_WORKERS to a value greater than 0.');
    }

    this._measureBundles = measureBundles;
    this._measures = measureBundles.map(mb => {
      const measureEntry = mb.entry.find(e => e.resource.resourceType === 'Measure');
      if (measureEntry) {
        return measureEntry.resource;
      } else {
        throw new Error(`Measure resource was not found for bundle with id ${mb.id}.`);
      }
    });
    this._periodStart = periodStart;
    this._periodEnd = periodEnd;

    // Prepare the fqm-execution measure report builder
    try {
      this._mrBuilders = this._measures.map(m => {
        const mrBuilder = new MeasureReportBuilder(m, {
          measurementPeriodStart: this._periodStart,
          measurementPeriodEnd: this._periodEnd,
          reportType: 'summary'
        });
        logger.info(`exec-queue: Created MRBuilder for ${mrBuilder.measure.id}`);
        return mrBuilder;
      });
    } catch (e) {
      logger.error(e);
      throw new Error(`Could not prepare report builder: ${e.message}`);
    }

    // Pick jobSize. If measure count * patient count / worker count is less than max job size then use that otherwise use max jobsize.
    const countCalculations = patientIds.length * measureBundles.length;
    let jobSize = Math.ceil(countCalculations / parseInt(process.env.EXEC_WORKERS));
    if (jobSize > parseInt(process.env.SCALED_EXEC_MAX_JOBSIZE)) {
      jobSize = parseInt(process.env.SCALED_EXEC_MAX_JOBSIZE);
    }

    // Prepare job data to be sent to workers.
    this._jobs = [];
    this._mrBuilders.forEach(currentBuilder => {
      // a job cannot be split across measures, so job(s) are constructed for each measure
      let index = 0;
      while (index < patientIds.length) {
        const end = index + jobSize < patientIds.length ? index + jobSize : patientIds.length;
        this._jobs.push({
          patientIds: patientIds.slice(index, end),
          measureId: currentBuilder.measure.id,
          periodStart: this._periodStart,
          periodEnd: this._periodEnd
        });
        index = end;
      }
    });
    logger.info(
      `exec-queue: Prepared ${this._jobs.length} jobs for scaled calculation of ${countCalculations} calculations.`
    );
  }

  /**
   * Executes the scaled calculation and returns the measure reports when complete.
   * @returns {Promise<fhir4.MeasureReport>[]}
   */
  async execute() {
    this._count = 0;
    const _this = this;

    // Construct the bee-queue jobs
    const jobs = this._jobs.map(jobData => execQueue.createJob(jobData));
    // Create promises for all jobs
    const jobPromises = jobs.map(job => {
      return new Promise((res, rej) => {
        job.on('succeeded', _this.tabulateResults.bind(_this));
        job.on('succeeded', () => res(true));
        job.on('failed', rej);
      });
    });
    // Enter all jobs into the queue
    await execQueue.saveAll(jobs);

    // Wait for all jobs to finish
    await Promise.all(jobPromises);
    logger.info(
      `exec-queue: Completed ${this._jobs.length} jobs for scaled calculation of ${this._count} calculations.`
    );

    return this._mrBuilders.map(mrb => mrb.getReport());
  }

  /**
   * Take the calculation results from a completed job and add them to the measure report builder.
   *
/**
 * @param {Object} jobResult
 * @param {import('fqm-execution/build/types/Calculator').CalculationOutput} jobResult.calcResult
 * @param {Object} jobResult.jobInfo result from the fqm-execution `calculate` call.
 */
  async tabulateResults(jobResult) {
    this._count += jobResult.calcResult.results.length;
    // find the correct builder for this job
    const currentBuilder = this._mrBuilders.find(mrb => mrb.measure.id === jobResult.jobInfo.measureId);
    jobResult.calcResult.results.forEach(execResult => {
      currentBuilder.addPatientResults(execResult);
    });
  }
}

module.exports = {
  execQueue,
  ScaledCalculation
};
