import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '../src/core/retry';
import { AuthError } from '../src/core/errors';

const noSleep = async () => {};

describe('withRetry', () => {
  it('retries transient errors and succeeds', async () => {
    const fn = vi
      .fn<(attempt: number) => Promise<string>>()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce('ok');
    await expect(withRetry(fn, 3, noSleep)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gives up after max attempts', async () => {
    const fn = vi.fn(async () => {
      throw new Error('down');
    });
    await expect(withRetry(fn, 3, noSleep)).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry fatal errors', async () => {
    const fn = vi.fn(async () => {
      throw new AuthError('Invalid credentials');
    });
    await expect(withRetry(fn, 5, noSleep)).rejects.toThrow('Invalid credentials');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
