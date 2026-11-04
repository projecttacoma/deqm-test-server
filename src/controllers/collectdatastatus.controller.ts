import type { Request, Response, NextFunction } from 'express';
import { checkCollectDataStatus, cancelCollectData } from '../services/collectdatastatus.service';

module.exports.collectDataStatus = (req: Request, res: Response, next: NextFunction) => {
  return checkCollectDataStatus(req, res)
    .then(result => res.json(result))
    .catch(err => next(err));
};

module.exports.cancelCollectData = (req: Request, res: Response, next: NextFunction) => {
  return cancelCollectData(req)
    .then(() => res.status(202).end())
    .catch(err => next(err));
};
