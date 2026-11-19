export class FatalError extends Error {
  override name = 'FatalError';
}

export class AuthError extends FatalError {
  override name = 'AuthError';
}

export class StaleRecordError extends FatalError {
  override name = 'StaleRecordError';
}

export function isRetryable(err: unknown): boolean {
  return !(err instanceof FatalError);
}

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

export function errorMessage(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return text.replace(ANSI, '');
}
