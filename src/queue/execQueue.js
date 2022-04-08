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

class ScaledCalculation {
  constructor(measureBundle, patientIds, periodStart, periodEnd) {
    if (!(process.env.EXEC_WORKERS > 0)) {
      throw new Error('Scalable Calculation is disabled. To enable set EXEC_WORKERS to a value greater than 0.');
    }

    this._measureBundle = measureBundle;
    this._periodStart = periodStart;
    this._periodEnd = periodEnd;

    // See if count/worker count is less than max job size. if it is use that as jobSize other wise use max job size
    let jobSize = Math.ceil(patientIds.length / parseInt(process.env.EXEC_WORKERS));
    if (jobSize > parseInt(process.env.SCALED_EXEC_MAX_JOBSIZE)) {
      jobSize = parseInt(process.env.SCALED_EXEC_MAX_JOBSIZE);
    }

    // Prepare measure report builder
    try {
      this._mrBuilder = new MeasureReportBuilder(this._measureBundle, {
        measurementPeriodStart: this._periodStart,
        measurementPeriodEnd: this._periodEnd,
        reportType: 'summary'
      });
      logger.info(`exec-queue: Created MRBuilder for ${this._mrBuilder.measure.id}`);
    } catch (e) {
      logger.error(e);
      throw new Error('Could not prepare report builder. Measure bundle may not have measure.', e);
    }

    // Prepare job data to be sent to workers.
    this._jobs = [];
    let index = 0;
    while (index < patientIds.length) {
      const end = index + jobSize < patientIds.length ? index + jobSize : patientIds.length;
      this._jobs.push({
        patientIds: patientIds.slice(index, end),
        measureId: this._mrBuilder.measure.id,
        periodStart: this._periodStart,
        periodEnd: this._periodEnd
      });
      index = end;
    }
    logger.info(
      `exec-queue: Prepared ${this._jobs.length} jobs for scaled calculation of ${patientIds.length} patients.`
    );
  }

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
    logger.info(`exec-queue: Completed ${this._jobs.length} jobs for scaled calculation of ${this._count} patients.`);

    return this._mrBuilder.getReport();
  }

  /**
   *
   * @param {import('fqm-execution/build/types/Calculator').CalculationOutput} jobResult
   */
  async tabulateResults(jobResult) {
    this._count += jobResult.results.length;
    jobResult.results.forEach(execResult => {
      this._mrBuilder.addPatientResults(execResult);
    });
  }
}

module.exports = {
  execQueue,
  ScaledCalculation
};