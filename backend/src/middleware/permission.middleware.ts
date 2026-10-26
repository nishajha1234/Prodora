import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import { authService } from '../services/auth.service.js';

/**
 * Require that the authenticated caller's role holds `permissionCode`.
 * Authorization is always evaluated server-side against the database, never
 * from client-supplied data.
 */
export function requirePermission(permissionCode: string) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!req.user?.id) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required.');
      }

      const permissions = await authService.getPermissions(req.user.id);
      if (!permissions.includes(permissionCode)) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'You do not have permission to perform this action.',
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
