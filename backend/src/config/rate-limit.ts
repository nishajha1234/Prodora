import type { NextFunction, Request, Response } from 'express';
import { env } from './env.js';

export type RateLimitKey = 'register' | 'login' | 'refresh';

export interface RateLimitConfig {
  max: number;
  windowMs: number;
}

const parseWindowMs = (value: string): number => {
  const match = value.match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid window "${value}". Expected e.g. "15m".`);
  }
  const numeric = Number(match[1]);
  const unit = match[2].toLowerCase() as 'ms' | 's' | 'm' | 'h' | 'd';
  const mult: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
  };
  return numeric * (mult[unit] ?? 1);
};

const parseLimit = (value: string): RateLimitConfig => {
  const [maxPart, windowPart] = value.split(':');
  if (!maxPart || !windowPart || !/^\d+$/.test(maxPart)) {
    throw new Error(`Invalid rate limit "${value}". Expected e.g. "5:15m".`);
  }
  return {
    max: Number(maxPart),
    windowMs: parseWindowMs(windowPart),
  };
};

const rateLimits: Record<RateLimitKey, RateLimitConfig> = {
  register: parseLimit(env.RATE_LIMIT_REGISTER),
  login: parseLimit(env.RATE_LIMIT_LOGIN),
  refresh: parseLimit(env.RATE_LIMIT_REFRESH),
};

// Lightweight in-memory sliding-window counters: bucket key -> hit timestamps.
// Intentionally process-local: this local MVP does not use Redis or any
// external store. Map size stays bounded because every key is rewritten with
// only the hits still inside its window on each call.
const buckets = new Map<string, number[]>();

function prune(key: string, windowMs: number): number[] {
  const now = Date.now();
  const active = (buckets.get(key) ?? []).filter((ts) => now - ts < windowMs);
  buckets.set(key, active);
  return active;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Record one hit against `bucketId` for the given limit and report whether
 * the caller is allowed. Sliding window over in-memory timestamps.
 */
export function consumeRateLimit(
  key: RateLimitKey,
  bucketId: string,
): RateLimitDecision {
  const config = rateLimits[key];
  const bucketKey = `${key}:${bucketId}`;
  const active = prune(bucketKey, config.windowMs);

  if (active.length >= config.max) {
    const oldest = active[0] ?? Date.now();
    const elapsed = Date.now() - oldest;
    const remainingMs = Math.max(config.windowMs - elapsed, 0);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil(remainingMs / 1000), 1),
    };
  }

  const hits = [...active, Date.now()];
  buckets.set(bucketKey, hits);
  return {
    allowed: true,
    remaining: config.max - hits.length,
    retryAfterSeconds: 0,
  };
}

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Express middleware rate limiting one auth action per client IP.
 * Emits 429 with Retry-After when the window is exhausted.
 */
export function rateLimit(key: RateLimitKey) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const decision = consumeRateLimit(key, clientIp(req));
    res.setHeader('X-RateLimit-Remaining', String(decision.remaining));

    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          requestId: req.requestId,
        },
      });
      return;
    }

    next();
  };
}

export function getRateLimitCounts(
  key: RateLimitKey,
  bucketId: string,
): number {
  const config = rateLimits[key];
  return prune(`${key}:${bucketId}`, config.windowMs).length;
}
