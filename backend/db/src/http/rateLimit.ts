import { createHash } from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import pool from '../lib/mysql';

type RateLimitPolicy = {
  name: string;
  method: string;
  path: RegExp;
  windowMs: number;
  max: number;
};

export type RateLimitStore = {
  increment(key: string, expiresAt: Date): Promise<number>;
};

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

export const API_RATE_LIMIT_POLICIES: RateLimitPolicy[] = [
  { name: 'waitlist', method: 'POST', path: /^\/waitlist\/?$/, windowMs: HOUR, max: 5 },
  { name: 'login', method: 'POST', path: /^\/auth\/login\/?$/, windowMs: 15 * MINUTE, max: 10 },
  { name: 'signup', method: 'POST', path: /^\/auth\/signup\/?$/, windowMs: HOUR, max: 5 },
  { name: 'provider-login', method: 'POST', path: /^\/auth\/provider-login\/?$/, windowMs: 15 * MINUTE, max: 10 },
  { name: 'vendor-login', method: 'POST', path: /^\/auth\/vendor-login\/?$/, windowMs: 15 * MINUTE, max: 10 },
  { name: 'forgot-password', method: 'POST', path: /^\/auth\/forgot-password\/?$/, windowMs: HOUR, max: 5 },
  { name: 'reset-password', method: 'POST', path: /^\/auth\/reset-password\/?$/, windowMs: HOUR, max: 5 },
  { name: 'change-password', method: 'POST', path: /^\/auth\/change-password\/?$/, windowMs: 15 * MINUTE, max: 5 },
  { name: 'validate-referral', method: 'POST', path: /^\/auth\/validate-referral\/?$/, windowMs: 15 * MINUTE, max: 30 },
  { name: 'booking-create', method: 'POST', path: /^\/bookings\/?$/, windowMs: 15 * MINUTE, max: 20 },
  { name: 'payment-quote', method: 'POST', path: /^\/payments\/quote\/?$/, windowMs: 15 * MINUTE, max: 30 },
  { name: 'payment-intent', method: 'POST', path: /^\/payments\/create-intent\/?$/, windowMs: 15 * MINUTE, max: 10 },
  { name: 'review-create', method: 'POST', path: /^\/reviews\/?$/, windowMs: HOUR, max: 10 },
  { name: 'vendor-booking', method: 'POST', path: /^\/vendor-services\/[^/]+\/book\/?$/, windowMs: 15 * MINUTE, max: 10 },
];

const databaseStore: RateLimitStore = {
  async increment(key, expiresAt) {
    const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);
    await pool.query(
      `INSERT INTO api_rate_limits (bucket_key, hit_count, expires_at)
       VALUES (?, 1, FROM_UNIXTIME(?))
       ON DUPLICATE KEY UPDATE hit_count = hit_count + 1`,
      [key, expiresAtSeconds]
    );
    const [rows] = await pool.query(
      'SELECT hit_count FROM api_rate_limits WHERE bucket_key = ?',
      [key]
    );

    // Opportunistically prune expired buckets without adding a scheduled job.
    if (Math.random() < 0.01) {
      void pool.query('DELETE FROM api_rate_limits WHERE expires_at < NOW() LIMIT 1000').catch(() => {});
    }
    return Number((rows as any[])?.[0]?.hit_count || 0);
  },
};

export function createSharedRateLimit(
  store: RateLimitStore = databaseStore,
  policies: RateLimitPolicy[] = API_RATE_LIMIT_POLICIES,
  now: () => number = Date.now
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const policy = policies.find((item) =>
      item.method === req.method.toUpperCase() && item.path.test(req.path)
    );
    if (!policy) return next();

    const timestamp = now();
    const windowStart = Math.floor(timestamp / policy.windowMs);
    const resetAt = (windowStart + 1) * policy.windowMs;
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const bucketKey = createHash('sha256')
      .update(`${policy.name}\n${clientIp}\n${windowStart}`)
      .digest('hex');

    try {
      const count = await store.increment(bucketKey, new Date(resetAt));
      res.setHeader('RateLimit-Limit', String(policy.max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, policy.max - count)));
      res.setHeader('RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
      if (count > policy.max) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAt - timestamp) / 1000))));
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      return next();
    } catch (error) {
      console.error('[rate-limit] shared store unavailable:', error);
      return res.status(503).json({ error: 'Request protection is temporarily unavailable.' });
    }
  };
}
