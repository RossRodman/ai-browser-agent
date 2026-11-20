import { chromium, type Page } from 'playwright';
import type { RunMode } from '../domain';
import { WriteGate } from './write-gate';

export interface Session {
  page: Page;
  gate: WriteGate;
  close(): Promise<void>;
}

export async function openSession(opts: {
  headless: boolean;
  mode: RunMode;
  executablePath?: string;
}): Promise<Session> {
  const browser = await chromium.launch({
    headless: opts.headless,
    executablePath: opts.executablePath,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const gate = new WriteGate(opts.mode);
  await gate.attach(context);
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  return { page, gate, close: () => browser.close() };
}
