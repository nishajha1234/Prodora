import type { Request } from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';
import { createAuthEvent } from '../audit/auth-event.js';
import { AuthEventAction, ActorType } from '../types/auth-events.js';
import {
  hashPassword,
  verifyPassword,
  minPasswordLength,
} from '../utils/hash.js';
import { normalizeEmail } from '../utils/email.js';
import { signAccessToken, verifyAccessToken } from '../utils/jwt.js';

export const REFRESH_TOKEN_TTL_MS =
  Number(env.REFRESH_TOKEN_TTL_DAYS) * 24 * 60 * 60 * 1000;
export const ACCESS_TOKEN_TTL_SECONDS = Math.floor(
  Number(env.JWT_ACCESS_TTL_MS) / 1000,
);

/** HttpOnly cookie carrying the opaque refresh token. Never readable by JS. */
export const REFRESH_COOKIE_NAME = 'prodora_refresh';

export interface AuthenticatedUser {
  id: bigint;
  uuid: string;
  email: string;
  displayName: string;
  roleCode: string;
}

export interface RegisterInput {
  email: string;
  displayName: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface UserPublic {
  id: string;
  uuid: string;
  email: string;
  displayName: string;
  roleCode: string;
}

/** Full result of register/login/refresh. The raw refreshToken is only ever
 * handed to the route layer so it can be written into an HttpOnly cookie; it
 * is never serialized into a response body or logged. */
export interface AuthResult {
  sessionId: string;
  user: UserPublic;
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
}

export interface SessionSummary {
  sessionId: string;
  createdAt: string;
  expiresAt: string;
}

const passwordSchema = z
  .string()
  .min(
    minPasswordLength,
    `Password must be at least ${minPasswordLength} characters.`,
  )
  .max(128, 'Password must be at most 128 characters.');

const registerSchema = z.object({
  email: z.string().max(255),
  displayName: z.string().trim().min(1).max(120),
  password: passwordSchema,
});

const loginSchema = z.object({
  email: z.string().max(255),
  password: passwordSchema,
});

function parseInput<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      parsed.error.issues[0]?.message ?? 'Invalid request body.',
    );
  }
  return parsed.data;
}

function normalizeEmailOrThrow(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'Enter a valid email address.');
  }
  try {
    return normalizeEmail(raw);
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Enter a valid email address.');
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function actorTypeFor(roleCode: string): ActorType {
  if (roleCode === 'owner') return ActorType.owner;
  if (roleCode === 'admin') return ActorType.admin;
  return ActorType.system;
}

function toPublic(
  user: { id: bigint; uuid: string; email: string; displayName: string },
  roleCode: string,
): UserPublic {
  return {
    id: user.id.toString(),
    uuid: user.uuid,
    email: user.email,
    displayName: user.displayName,
    roleCode,
  };
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');

const sessionLost = (code = 'SESSION_REVOKED') =>
  new AppError(401, code, 'Session is no longer valid. Please sign in again.');

/** Lazily-computed bcrypt hash used to equalize timing between "unknown
 * email" and "wrong password" responses. Never used as a real credential. */
let timingEqualizerHash: Promise<string> | undefined;
async function burnPasswordCompare(password: string): Promise<void> {
  timingEqualizerHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await timingEqualizerHash);
}

export class AuthService {
  async register(
    input: RegisterInput,
    ip: string,
    ua: string,
  ): Promise<AuthResult> {
    const data = parseInput(registerSchema, input);
    const email = normalizeEmailOrThrow(input.email);
    const passwordHash = await hashPassword(data.password);

    const ownerRole = await prisma.role.findUnique({
      where: { code: 'owner' },
    });
    if (!ownerRole) {
      throw new AppError(500, 'CONFIG_ERROR', 'Owner role is not configured.');
    }

    let user: { id: bigint; uuid: string; email: string; displayName: string };
    try {
      user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          displayName: data.displayName,
          roleId: ownerRole.id,
        },
      });
    } catch (error) {
      // Unique constraint on email: concurrent registration of the same address.
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new AppError(
          409,
          'EMAIL_TAKEN',
          'That email is already registered.',
        );
      }
      throw error;
    }

    const session = await this.createSession(user.id);
    const accessToken = signAccessToken({
      sub: user.id.toString(),
      email: user.email,
      roleCode: ownerRole.code,
    });

    await createAuthEvent({
      actorType: ActorType.owner,
      action: AuthEventAction.registration,
      targetType: 'user',
      targetId: user.uuid,
      actorIp: ip,
      actorUserAgent: ua,
      details: JSON.stringify({ sessionId: session.sessionId }),
    });

    return {
      sessionId: session.sessionId,
      user: toPublic(user, ownerRole.code),
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: session.refreshToken,
    };
  }

  async login(input: LoginInput, ip: string, ua: string): Promise<AuthResult> {
    const data = parseInput(loginSchema, input);
    const email = normalizeEmailOrThrow(input.email);

    const user = await prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });

    const passwordOk = user
      ? await verifyPassword(data.password, user.passwordHash)
      : await burnPasswordCompare(data.password);

    if (!user || !passwordOk) {
      await createAuthEvent({
        actorType: ActorType.system,
        action: AuthEventAction.login,
        targetType: 'user',
        targetId: null,
        actorIp: ip,
        actorUserAgent: ua,
        details: JSON.stringify({
          success: false,
          reason: 'invalid_credentials',
        }),
      });
      throw invalidCredentials();
    }

    if (user.status === 'disabled') {
      await createAuthEvent({
        actorType: actorTypeFor(user.role.code),
        action: AuthEventAction.login,
        targetType: 'user',
        targetId: user.uuid,
        actorIp: ip,
        actorUserAgent: ua,
        details: JSON.stringify({ success: false, reason: 'disabled' }),
      });
      throw new AppError(403, 'USER_DISABLED', 'This account is disabled.');
    }

    const session = await this.createSession(user.id);
    const accessToken = signAccessToken({
      sub: user.id.toString(),
      email: user.email,
      roleCode: user.role.code,
    });

    await createAuthEvent({
      actorType: actorTypeFor(user.role.code),
      action: AuthEventAction.login,
      targetType: 'user',
      targetId: user.uuid,
      actorIp: ip,
      actorUserAgent: ua,
      details: JSON.stringify({
        success: true,
        sessionId: session.sessionId,
      }),
    });

    return {
      sessionId: session.sessionId,
      user: toPublic(user, user.role.code),
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: session.refreshToken,
    };
  }

  /**
   * Strict rotation: the presented token is consumed atomically and a single
   * successor is issued. Presenting an already-rotated or revoked token means
   * the token leaked, so the whole session is revoked.
   */
  async refresh(
    refreshToken: string,
    ip: string,
    ua: string,
  ): Promise<AuthResult> {
    if (typeof refreshToken !== 'string' || refreshToken.length < 20) {
      throw sessionLost('INVALID_REFRESH_TOKEN');
    }

    const tokenHash = sha256(refreshToken);
    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { role: true } } },
    });

    if (!record) {
      await createAuthEvent({
        actorType: ActorType.system,
        action: AuthEventAction.token_rejected,
        targetType: 'session',
        targetId: null,
        actorIp: ip,
        actorUserAgent: ua,
        details: JSON.stringify({ reason: 'unknown_token' }),
      });
      throw sessionLost();
    }

    if (record.revokedAt) {
      // Reuse of a rotated/revoked token: assume compromise and kill the session.
      await this.revokeSessionRows(record.sessionId);
      await createAuthEvent({
        actorType: actorTypeFor(record.user.role.code),
        action: record.replacedByTokenHash
          ? AuthEventAction.token_reuse
          : AuthEventAction.token_rejected,
        targetType: 'session',
        targetId: record.sessionId,
        actorIp: ip,
        actorUserAgent: ua,
        details: JSON.stringify({
          reason: record.replacedByTokenHash
            ? 'rotated_token_reused'
            : 'revoked',
        }),
      });
      throw sessionLost();
    }

    if (record.expiresAt.getTime() < Date.now()) {
      await this.revokeSessionRows(record.sessionId);
      await createAuthEvent({
        actorType: actorTypeFor(record.user.role.code),
        action: AuthEventAction.token_expired,
        targetType: 'session',
        targetId: record.sessionId,
        actorIp: ip,
        actorUserAgent: ua,
        details: JSON.stringify({ reason: 'refresh_expired' }),
      });
      throw sessionLost('TOKEN_EXPIRED');
    }

    if (record.user.status === 'disabled') {
      await this.revokeSessionRows(record.sessionId);
      throw new AppError(403, 'USER_DISABLED', 'This account is disabled.');
    }

    const newRefreshToken = randomBytes(48).toString('base64url');
    const newHash = sha256(newRefreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    // Atomic rotation: consume the old token and insert its successor together.
    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: record.id },
        data: {
          revokedAt: new Date(),
          replacedByTokenHash: newHash,
          expiresAt,
        },
      }),
      prisma.refreshToken.create({
        data: {
          tokenHash: newHash,
          sessionId: record.sessionId,
          userId: record.userId,
          expiresAt,
        },
      }),
    ]);

    const accessToken = signAccessToken({
      sub: record.user.id.toString(),
      email: record.user.email,
      roleCode: record.user.role.code,
    });

    await createAuthEvent({
      actorType: actorTypeFor(record.user.role.code),
      action: AuthEventAction.refresh_rotate,
      targetType: 'session',
      targetId: record.sessionId,
      actorIp: ip,
      actorUserAgent: ua,
      details: JSON.stringify({ sessionId: record.sessionId }),
    });

    return {
      sessionId: record.sessionId,
      user: toPublic(record.user, record.user.role.code),
      accessToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: newRefreshToken,
    };
  }

  /** Log out the session owning this refresh token and revoke every token in it. */
  async logout(
    refreshToken: string | undefined,
    ip: string,
    ua: string,
  ): Promise<void> {
    if (typeof refreshToken !== 'string' || refreshToken.length < 20) {
      return;
    }

    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      select: { sessionId: true },
    });

    if (!record) {
      await createAuthEvent({
        actorType: ActorType.system,
        action: AuthEventAction.logout,
        targetType: 'session',
        targetId: null,
        actorIp: ip,
        actorUserAgent: ua,
        details: JSON.stringify({ success: false, reason: 'unknown_token' }),
      });
      return;
    }

    await this.revokeSessionRows(record.sessionId);
    await createAuthEvent({
      actorType: ActorType.owner,
      action: AuthEventAction.logout,
      targetType: 'session',
      targetId: record.sessionId,
      actorIp: ip,
      actorUserAgent: ua,
      details: JSON.stringify({ success: true }),
    });
  }

  /** Revoke one of the caller's own sessions. Scoped by userId so a token for
   * user A can never revoke a session belonging to user B. */
  async revokeSession(
    userId: bigint,
    sessionId: string,
    ip: string,
    ua: string,
  ): Promise<void> {
    const revoked = await this.revokeSessionRows(sessionId, userId);
    if (revoked === 0) {
      throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
    }
    await createAuthEvent({
      actorType: ActorType.owner,
      action: AuthEventAction.session_revoke,
      targetType: 'session',
      targetId: sessionId,
      actorIp: ip,
      actorUserAgent: ua,
      details: JSON.stringify({ success: true }),
    });
  }

  async listSessions(userId: bigint): Promise<SessionSummary[]> {
    const records = await prisma.refreshToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { sessionId: true, createdAt: true, expiresAt: true },
    });
    return records.map((record) => ({
      sessionId: record.sessionId,
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
    }));
  }

  async getMe(userId: bigint): Promise<UserPublic> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
    }
    return toPublic(user, user.role.code);
  }

  async getPermissions(userId: bigint): Promise<string[]> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { roleId: true },
    });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found.');
    }
    const grants = await prisma.rolePermission.findMany({
      where: { roleId: user.roleId },
      select: { permission: { select: { code: true } } },
    });
    return grants.map((grant) => grant.permission.code);
  }

  /** Verify a bearer access token and attach the caller to the request. */
  async requireAuthentication(
    req: Request,
    token: string,
  ): Promise<AuthenticatedUser> {
    let sub: string;
    try {
      const decoded = verifyAccessToken(token);
      sub = decoded.sub;
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token.');
    }

    let userId: bigint;
    try {
      userId = BigInt(sub);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token.');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });
    if (!user) {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired token.');
    }
    if (user.status === 'disabled') {
      throw new AppError(403, 'ACCOUNT_DISABLED', 'This account is disabled.');
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      uuid: user.uuid,
      email: user.email,
      displayName: user.displayName,
      roleCode: user.role.code,
    };
    req.user = authUser;
    return authUser;
  }

  private async createSession(
    userId: bigint,
  ): Promise<{ sessionId: string; refreshToken: string }> {
    const refreshToken = randomBytes(48).toString('base64url');
    const sessionId = randomUUID();
    await prisma.refreshToken.create({
      data: {
        tokenHash: sha256(refreshToken),
        sessionId,
        userId,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });
    return { sessionId, refreshToken };
  }

  private async revokeSessionRows(
    sessionId: string,
    userId?: bigint,
  ): Promise<number> {
    const result = await prisma.refreshToken.updateMany({
      where: {
        sessionId,
        revokedAt: null,
        ...(userId ? { userId } : {}),
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }
}

export const authService = new AuthService();
