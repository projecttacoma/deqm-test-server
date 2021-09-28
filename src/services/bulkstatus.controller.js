const service = require('./bulkstatus.service.js');

/**
 * @name exports
 * @summary bulkstatus controller
 */
module.exports.bulkstatus = (req, res, next) => {
  return service
    .checkBulkStatus(req, res)
    .then(result => res.status(200).json(result))
    .catch(err => next(err));
};
