//@ts-nocheck 
const service = require('../services/import.service');

/**
 * @name exports
 * @summary import controller
 */
module.exports.bulkImport = (req, res, next) => {
  return service
    .bulkImport(req, res)
    .then(result => res.json(result))
    .catch(err => next(err));
};
