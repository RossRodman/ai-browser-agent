import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function resolveRunsDir(): string {
  const fromEnv = process.env.RUNS_DIR;
  return fromEnv ? path.resolve(REPO_ROOT, fromEnv) : path.join(REPO_ROOT, 'runs');
}

export function loadEnv(): void {
  const file = path.join(REPO_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
