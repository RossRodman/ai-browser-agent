import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function loadEnv(): void {
  const file = path.join(REPO_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function resolveRunsDir(): string {
  return path.resolve(REPO_ROOT, process.env.RUNS_DIR ?? 'runs');
}

export interface AgentConfig {
  baseUrl: string;
  username: string;
  password: string;
  runsDir: string;
  headless: boolean;
  maxAttempts: number;
  browserPath?: string;
  llm: { apiKey: string; model: string; baseUrl: string };
}

export function loadConfig(): AgentConfig {
  loadEnv();
  const env = process.env;
  return {
    baseUrl: (env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    username: env.DEMO_USER ?? 'demo',
    password: env.DEMO_PASSWORD ?? 'demo',
    runsDir: resolveRunsDir(),
    headless: env.HEADLESS !== 'false',
    maxAttempts: Number(env.MAX_ATTEMPTS ?? 3),
    browserPath: env.BROWSER_PATH || undefined,
    llm: {
      apiKey: env.LLM_API_KEY ?? '',
      model: env.LLM_MODEL ?? '',
      baseUrl: (env.LLM_BASE_URL ?? '').replace(/\/$/, ''),
    },
  };
}
