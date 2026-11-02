import type { Request, Response, NextFunction } from 'express';
import { checkCollectDataStatus } from '../services/collectdatastatus.service';

module.exports.collectDataStatus = (req: Request, res: Response, next: NextFunction) => {
  return checkCollectDataStatus(req, res)
    .then(result => res.json(result))
    .catch(err => next(err));
};
