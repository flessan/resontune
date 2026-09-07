import type { Request, Response, NextFunction } from 'express';

/** Wrap an async route handler so rejections hit the error middleware. */
export const asyncRoute =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

/** Same, for middleware: continues the chain when the check passes. */
export const asyncMiddleware =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).then(() => next(), next);
  };

/**
 * What the API says when a request authenticates against an account that has
 * since been deleted. One sentence, one meaning, one status code (401) — so
 * the client can react the same way wherever it happens.
 */
export const ACCOUNT_GONE_MESSAGE = 'This account no longer exists. Sign in again to continue.';

/**
 * True for a Postgres foreign-key violation caused by a row that references
 * `users`. It is what a write racing an account deletion looks like from the
 * database's side: the account vanished between the request being
 * authenticated and the insert being attempted.
 */
export function isDeletedAccountViolation(err: unknown): boolean {
  const e = err as { code?: unknown; constraint?: unknown; detail?: unknown; message?: unknown };
  if (String(e?.code) !== '23503') return false;
  const where = `${String(e?.constraint ?? '')} ${String(e?.detail ?? '')} ${String(e?.message ?? '')}`;
  return /user/i.test(where);
}

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
