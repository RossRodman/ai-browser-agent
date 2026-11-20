import { loadEnv, resolveRunsDir } from './paths';

export interface AgentConfig {
  baseUrl: string;
  username: string;
  password: string;
  runsDir: string;
  headless: boolean;
  maxAttempts: number;
  browserPath?: string;
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
  };
}
