import type { Request, Response, NextFunction } from 'express';

/** Wrap an async route handler so rejections hit the error middleware. */
export const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/** Parse pagination with hard bounds — payloads stay bounded no matter what. */
export function pagination(req: Request, defaults = { limit: 24, max: 60 }) {
  const limit = Math.min(
    defaults.max,
    Math.max(1, Number.parseInt(String(req.query.limit ?? defaults.limit), 10) || defaults.limit),
  );
  const offset = Math.max(0, Number.parseInt(String(req.query.offset ?? 0), 10) || 0);
  return { limit, offset: Math.min(offset, 10_000) };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
