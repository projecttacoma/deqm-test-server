const service = require('../services/bulkstatus.service.js');

/**
 * @name exports
 * @summary bulkstatus controller
 */
module.exports.bulkstatus = (req, res, next) => {
  return service
    .checkBulkStatus(req, res)
    .then(result => res.json(result))
    .catch(err => next(err));
};

//This comment is in the wrong branch
