import { createStore, type RunMode, type RunStore } from '../domain';
import { loadConfig, type AgentConfig } from '../config';
import { openSession } from '../browser/session';
import { DemoSite } from '../browser/demo-site';
import { StepRunner } from '../core/audit';
import { errorMessage } from '../core/errors';

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

export async function runCli(
  main: (ctx: { cfg: AgentConfig; store: RunStore }) => Promise<void>,
): Promise<void> {
  let store: RunStore | undefined;
  try {
    const cfg = loadConfig();
    store = createStore(cfg);
    await main({ cfg, store });
  } catch (err) {
    console.error(errorMessage(err));
    process.exitCode = 1;
  } finally {
    await store?.close();
  }
}
