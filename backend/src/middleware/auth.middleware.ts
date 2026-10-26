import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { authService } from '../services/auth.service.js';

/**
 * Authenticate a request from the `Authorization: Bearer <access token>`
 * header only. The HttpOnly refresh cookie is deliberately NOT accepted here:
 * it only ever authorizes `POST /auth/refresh`, so an XSS-leaked cookie can
 * never be replayed as an API credential.
 */
export function requireAuthentication(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
    return;
  }

  authService
    .requireAuthentication(req, header.slice(7))
    .then(() => next())
    .catch(next);
}
