const service = require('./import.service');

/**
 * @name exports
 * @summary import controller
 */
module.exports.bulkImport = (req, res, next) => {
  return service
    .bulkImport(req, res)
    .then(result => res.status(200).json(result))
    .catch(err => next(err));
};
