import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { rateLimit } from '../config/rate-limit.js';
import { AppError } from '../errors/app-error.js';
import { requireAuthentication } from '../middleware/auth.middleware.js';
import { attachRequestContext } from '../middleware/request-context.js';
import {
  authService,
  REFRESH_COOKIE_NAME,
  type AuthResult,
} from '../services/auth.service.js';

const COOKIE_MAX_AGE_MS =
  Number(env.REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/v1/auth',
};

function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== REFRESH_COOKIE_NAME) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...cookieOptions,
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions);
}

/** Send an auth response. The raw refresh token goes ONLY into the HttpOnly
 * cookie — it is never included in the JSON body or any log line. */
function sendSession(res: Response, result: AuthResult, status = 200): void {
  setRefreshCookie(res, result.refreshToken);
  res.status(status).json({
    sessionId: result.sessionId,
    accessToken: result.accessToken,
    expiresIn: result.expiresIn,
    user: result.user,
  });
}

function context(res: Response): { ip: string; ua: string } {
  return {
    ip: res.locals.requestIp ?? 'unknown',
    ua: res.locals.requestUserAgent ?? 'unknown',
  };
}

export const authRouter = Router();

// --- Public: register -------------------------------------------------------

authRouter.post(
  '/register',
  attachRequestContext,
  rateLimit('register'),
  (req, res, next) => {
    const { ip, ua } = context(res);
    authService
      .register(req.body, ip, ua)
      .then((result) => sendSession(res, result, 201))
      .catch(next);
  },
);

// --- Public: login ----------------------------------------------------------

authRouter.post(
  '/login',
  attachRequestContext,
  rateLimit('login'),
  (req, res, next) => {
    const { ip, ua } = context(res);
    authService
      .login(req.body, ip, ua)
      .then((result) => sendSession(res, result))
      .catch(next);
  },
);

// --- Public: refresh (HttpOnly cookie only) ---------------------------------

authRouter.post(
  '/refresh',
  attachRequestContext,
  rateLimit('refresh'),
  (req, res, next) => {
    const { ip, ua } = context(res);
    const refreshToken = readRefreshCookie(req);
    authService
      .refresh(refreshToken ?? '', ip, ua)
      .then((result) => sendSession(res, result))
      .catch((error: unknown) => {
        // Failed refresh: the cookie is worthless now, expire it.
        clearRefreshCookie(res);
        next(error);
      });
  },
);

// --- Logout: session-scoped, works even with an expired access token --------

authRouter.post('/logout', attachRequestContext, (req, res, next) => {
  const { ip, ua } = context(res);
  authService
    .logout(readRefreshCookie(req), ip, ua)
    .then(() => {
      clearRefreshCookie(res);
      res.json({ status: 'ok' });
    })
    .catch(next);
});

// --- Authenticated: session management --------------------------------------

authRouter.post(
  '/revoke',
  attachRequestContext,
  requireAuthentication,
  (req, res, next) => {
    const sessionId = (req.body as { sessionId?: unknown })?.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      next(new AppError(400, 'VALIDATION_ERROR', 'sessionId is required.'));
      return;
    }
    const { ip, ua } = context(res);
    authService
      .revokeSession(req.user!.id, sessionId, ip, ua)
      .then(() => res.json({ status: 'ok' }))
      .catch(next);
  },
);

authRouter.get(
  '/sessions',
  attachRequestContext,
  requireAuthentication,
  (req, res, next) => {
    authService
      .listSessions(req.user!.id)
      .then((sessions) => res.json({ sessions }))
      .catch(next);
  },
);

authRouter.get(
  '/me',
  attachRequestContext,
  requireAuthentication,
  (req, res, next) => {
    authService
      .getMe(req.user!.id)
      .then((user) => res.json({ user }))
      .catch(next);
  },
);

authRouter.get(
  '/permissions',
  attachRequestContext,
  requireAuthentication,
  (req, res, next) => {
    authService
      .getPermissions(req.user!.id)
      .then((permissions) => res.json({ permissions }))
      .catch(next);
  },
);

// Any other auth route is unknown.
authRouter.use((_req, _res, next) => {
  next(
    new AppError(
      404,
      'RESOURCE_NOT_FOUND',
      'The requested resource was not found.',
    ),
  );
});
