import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestId(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const id = randomUUID();
  request.requestId = id;
  response.setHeader('X-Request-Id', id);
  next();
}
