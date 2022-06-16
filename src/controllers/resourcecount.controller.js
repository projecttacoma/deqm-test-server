const service = require('../services/resourcecount.service');

/**
 *
 * @param {*} req
 * @param {*} res
 * @param {*} next
 * @returns service
 */
module.exports.resourceCount = (req, res, next) => {
  return service
    .getAllResourceCounts()
    .then(result => res.status(200).json(result))
    .catch(err => next(err));
};
