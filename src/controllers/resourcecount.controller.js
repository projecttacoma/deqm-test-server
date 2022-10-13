const service = require('../services/resourcecount.service');

/**
 * @name exports
 * @summary resource count controller
 */
module.exports.resourceCount = (req, res, next) => {
  return service
    .getAllResourceCounts()
    .then(result => res.status(200).json(result))
    .catch(err => next(err));
};
