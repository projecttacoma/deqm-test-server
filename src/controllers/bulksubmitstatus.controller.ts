import { bulkSubmitStatus } from '../services/bulksubmitstatus.service';

/**
 * @name exports
 * @summary bulk-submit-status controller
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const bulkSubmitStatusController = (req: any, res: any, next: any) => {
  return bulkSubmitStatus(req, res)
    .then(result => res.json(result))
    .catch(err => next(err));
};
