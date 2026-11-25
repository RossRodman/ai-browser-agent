import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunStore } from '../src/domain';
import { openSession } from '../src/browser/session';
import { DemoSite } from '../src/browser/demo-site';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE_URL = 'http://localhost:3199';
const UI_URL = 'http://localhost:4199';

function tsx(file: string, args: string[], env: NodeJS.ProcessEnv) {
  return spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, file), ...args], {
    cwd: ROOT,
    env: { ...process.env, ...env },
  });
}

function run(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve) => {
    let output = '';
    const child = tsx(file, args, env);
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    child.on('close', () => resolve(output));
  });
}

async function waitFor(url: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(url, { redirect: 'manual' }).then(
        () => true,
        () => false,
      )
    )
      return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} did not start`);
}

export async function startApp() {
  const runsDir = await mkdtemp(path.join(tmpdir(), 'aba-e2e-'));
  const env = {
    DEMO_PORT: '3199',
    APPROVAL_PORT: '4199',
    BASE_URL,
    RUNS_DIR: runsDir,
    DEMO_FAILURE_RATE: '0',
    HEADLESS: 'true',
    LLM_API_KEY: '',
  };
  const servers = [
    tsx('apps/demo-site/src/server.ts', [], env),
    tsx('apps/agent/src/ui/server.ts', [], env),
  ];
  await Promise.all([waitFor(BASE_URL), waitFor(UI_URL)]);
  const store = new RunStore(runsDir);

  return {
    scan: () => run('apps/agent/src/cli/scan.ts', [], env),

    execute: (runId: string) => run('apps/agent/src/cli/execute.ts', ['--run', runId], env),

    lastRun: async () => {
      const [meta] = await store.listRuns();
      return { id: meta!.id, proposals: await store.getProposals(meta!.id) };
    },

    decide: (runId: string, actionId: string, decision: 'approved' | 'rejected') =>
      fetch(`${UI_URL}/runs/${runId}/actions/${actionId}`, {
        method: 'POST',
        body: new URLSearchParams({ decision }),
        redirect: 'manual',
      }),

    readField: async (recordId: string, field: string) => {
      const login = await fetch(`${BASE_URL}/login`, {
        method: 'POST',
        body: new URLSearchParams({ username: 'demo', password: 'demo' }),
        redirect: 'manual',
      });
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
      const page = await fetch(`${BASE_URL}/records/${recordId}/edit`, { headers: { cookie } });
      return (await page.text()).match(new RegExp(`name="${field}" value="([^"]*)"`))?.[1];
    },

    readOnlySite: async () => {
      const session = await openSession({
        headless: true,
        mode: 'read_only',
        executablePath: process.env.BROWSER_PATH || undefined,
      });
      const site = new DemoSite(session.page, BASE_URL);
      await site.login('demo', 'demo');
      return { site, close: session.close };
    },

    stop: async () => {
      servers.forEach((s) => s.kill());
      await rm(runsDir, { recursive: true, force: true });
    },
  };
}
