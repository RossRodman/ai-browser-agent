import { isRetryable } from './errors';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  attempts: number,
  sleep = wait,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= attempts || !isRetryable(err)) throw err;
      await sleep(Math.min(8000, 500 * 2 ** (attempt - 1)));
    }
  }
}
