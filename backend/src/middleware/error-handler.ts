import type { ErrorRequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  void _next;
  const isExpected = error instanceof AppError;
  const statusCode = isExpected ? error.statusCode : 500;
  const code = isExpected ? error.code : 'INTERNAL_SERVER_ERROR';
  const message = isExpected
    ? error.message
    : 'An unexpected error occurred. Please try again later.';

  if (!isExpected) {
    console.error(`[${request.requestId}] Unexpected API error`, error);
  }

  response.status(statusCode).json({
    error: {
      code,
      message,
      requestId: request.requestId,
    },
  });
};
