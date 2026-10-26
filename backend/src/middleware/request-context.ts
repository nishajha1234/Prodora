import type { NextFunction, Request, Response } from 'express';

/** Attach the client IP and user agent to `res.locals` for audit logging,
 * then continue to the next handler. */
export function attachRequestContext(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedFirst =
    typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined;

  const ip =
    forwardedFirst ||
    req.socket?.remoteAddress?.replace('::ffff:', '') ||
    'unknown';

  res.locals.requestIp = ip;
  res.locals.requestUserAgent =
    req.headers['user-agent']?.toString() ?? 'unknown';
  next();
}
