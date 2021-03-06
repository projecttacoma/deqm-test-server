const service = require('../services/clientfile.service.js');

/**
 * @name exports
 * @summary client file controller
 */
module.exports.clientFile = (req, res, next) => {
  return service
    .getClientFile(req, res)
    .then(result => res.sendFile(result))
    .catch(err => next(err));
};
