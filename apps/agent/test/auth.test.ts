import { describe, expect, it } from 'vitest';
import {
  SESSION_TTL_MS,
  createSession,
  hashPassword,
  parseReviewers,
  readSession,
  verifyPassword,
} from '../src/ui/auth';

const secret = 'a-long-enough-test-secret';

describe('passwords', () => {
  it('accepts the right password and rejects others', () => {
    const hash = hashPassword('correct horse');
    expect(verifyPassword('correct horse', hash)).toBe(true);
    expect(verifyPassword('wrong', hash)).toBe(false);
    expect(verifyPassword('correct horse', 'plain-text')).toBe(false);
  });

  it('uses a new salt every time', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('reads reviewers from a comma-separated list', () => {
    const reviewers = parseReviewers(
      `ross:${hashPassword('a')}, bob:${hashPassword('b')},broken`,
    );
    expect([...reviewers.keys()]).toEqual(['ross', 'bob']);
    expect(verifyPassword('b', reviewers.get('bob')!)).toBe(true);
  });
});

describe('sessions', () => {
  it('returns the user for a valid session', () => {
    expect(readSession(createSession('ross', secret), secret)).toBe('ross');
  });

  it('rejects tampered, foreign and expired sessions', () => {
    const token = createSession('ross', secret);
    const [, expires, signature] = token.split('.');
    const forged = `${Buffer.from('admin').toString('base64url')}.${expires}.${signature}`;

    expect(readSession(forged, secret)).toBeUndefined();
    expect(readSession(token, 'another-secret-value')).toBeUndefined();
    expect(readSession(token, secret, Date.now() + SESSION_TTL_MS + 1000)).toBeUndefined();
    expect(readSession('garbage', secret)).toBeUndefined();
  });
});
