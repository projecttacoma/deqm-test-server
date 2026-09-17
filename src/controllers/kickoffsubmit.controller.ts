//@ts-nocheck
const service = require('../services/kickoffsubmit.service');

/**
 * @summary Convenience controller for submitting data specified in a data exchange MeasureReport.
 */
module.exports.kickoffSubmit = (req, res, next) => {
  return service
    .kickoffSubmit(req, res)
    .then(result => res.json(result))
    .catch(err => next(err));
};
