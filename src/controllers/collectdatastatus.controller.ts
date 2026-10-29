//@ts-nocheck
const service = require('../services/collectdatastatus.service');

module.exports.collectDataStatus = (req, res, next) => {
  return service
    .checkCollectDataStatus(req, res)
    .then(result => res.json(result))
    .catch(err => next(err));
};
