import { RunStore, type RunMode } from '../domain';
import { loadConfig, type AgentConfig } from '../config';
import { openSession } from '../browser/session';
import { DemoSite } from '../browser/demo-site';
import { StepRunner } from '../core/audit';
import { errorMessage } from '../core/errors';

export function setup() {
  const cfg = loadConfig();
  return { cfg, store: new RunStore(cfg.runsDir) };
}

export async function openBrowser(cfg: AgentConfig, store: RunStore, runId: string, mode: RunMode) {
  await store.init(runId);
  const session = await openSession({
    headless: cfg.headless,
    mode,
    executablePath: cfg.browserPath,
  });
  const site = new DemoSite(session.page, cfg.baseUrl);
  const lastStep = Math.max(0, ...(await store.getSteps(runId)).map((s) => s.n));
  const steps = new StepRunner(runId, store, session.page, cfg.maxAttempts, lastStep);
  const login = () => steps.step('login', () => site.login(cfg.username, cfg.password));
  return { session, site, steps, login };
}

export function runCli(main: () => Promise<void>): void {
  main().catch((err) => {
    console.error(errorMessage(err));
    process.exit(1);
  });
}
