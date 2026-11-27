import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const SESSION_COOKIE = 'aba_session';
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length > 0 && timingSafeEqual(actual, expected);
}

export function parseReviewers(value: string): Map<string, string> {
  const reviewers = new Map<string, string>();
  for (const entry of value.split(',')) {
    const [user, ...hash] = entry.trim().split(':');
    if (user && hash.length) reviewers.set(user, hash.join(':'));
  }
  return reviewers;
}

const sign = (data: string, secret: string) =>
  createHmac('sha256', secret).update(data).digest('base64url');

export function createSession(user: string, secret: string, now = Date.now()): string {
  const data = `${Buffer.from(user).toString('base64url')}.${now + SESSION_TTL_MS}`;
  return `${data}.${sign(data, secret)}`;
}

export function readSession(token: string, secret: string, now = Date.now()): string | undefined {
  const [user, expires, signature] = token.split('.');
  if (!user || !expires || !signature) return undefined;
  const expected = Buffer.from(sign(`${user}.${expires}`, secret));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
  if (Number(expires) < now) return undefined;
  return Buffer.from(user, 'base64url').toString();
}

function sessionToken(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [key, value] = part.trim().split('=');
    if (key === SESSION_COOKIE) return value;
  }
}

export function sessionCookie(token: string, maxAgeMs: number): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeMs / 1000}`;
}

export function requireUser(secret: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const token = sessionToken(req);
    const user = token && readSession(token, secret);
    if (!user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    res.locals.user = user;
    next();
  };
}

export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin ?? req.headers.referer;
  if (origin && URL.parse(origin)?.host === req.headers.host) return next();
  res.status(403).send('Forbidden: request did not come from this site');
}
