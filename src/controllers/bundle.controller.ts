//@ts-nocheck
const service = require('../services/bundle.service');

/**
 * @name exports
 * @summary Transaction controller
 */
module.exports.transaction = (req, res, next) => {
  return service
    .uploadTransactionBundle(req, res)
    .then(result => res.status(200).json(result))
    .catch(err => next(err));
};
