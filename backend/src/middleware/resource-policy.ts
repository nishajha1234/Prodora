import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';

export interface AuthorizedContext {
  userId?: bigint;
  roleCode?: string;
  email?: string;
}

export interface ResourcePolicyOptions {
  /** Caller must match the owner identifier present on the request. */
  requireOwner?: boolean;
  /** If set, only these role codes may pass. */
  allowedRoleCodes?: string[];
  /** These role codes are always denied (e.g. `['owner']` for admin-only
   * or repairer-only operations). */
  forbidRoleCodes?: string[];
}

/**
 * Route-level resource policy evaluated on the server-authenticated user.
 * `ctx` must come from the verified token (req.user), never from the client.
 */
export function resourcePolicy(
  ctx: AuthorizedContext,
  options: ResourcePolicyOptions,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!ctx.userId) {
      next(new AppError(401, 'UNAUTHORIZED', 'Authentication required.'));
      return;
    }

    const roleCode = ctx.roleCode ?? '';

    if (options.forbidRoleCodes?.includes(roleCode)) {
      next(
        new AppError(
          403,
          'FORBIDDEN',
          'This operation is restricted for your role.',
        ),
      );
      return;
    }

    if (
      options.allowedRoleCodes &&
      !options.allowedRoleCodes.includes(roleCode)
    ) {
      next(
        new AppError(
          403,
          'FORBIDDEN',
          'This operation is restricted for your role.',
        ),
      );
      return;
    }

    if (options.requireOwner) {
      const targetOwner =
        (typeof req.params?.ownerEmail === 'string' && req.params.ownerEmail) ||
        (typeof req.body?.ownerEmail === 'string' && req.body.ownerEmail) ||
        (typeof req.params?.ownerId === 'string' && req.params.ownerId) ||
        (typeof req.body?.ownerId === 'string' && req.body.ownerId);

      const matches =
        targetOwner === ctx.email || targetOwner === ctx.userId?.toString();

      if (!matches) {
        next(new AppError(403, 'FORBIDDEN', 'You do not own this resource.'));
        return;
      }
    }

    next();
  };
}
