import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';

export function notFound(
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next(
    new AppError(
      404,
      'RESOURCE_NOT_FOUND',
      'The requested resource was not found.',
    ),
  );
}
