import path from 'node:path';
import type { Page } from 'playwright';
import type { RunStore } from '../domain';
import { errorMessage } from './errors';
import { withRetry } from './retry';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export class StepRunner {
  constructor(
    private readonly runId: string,
    private readonly store: RunStore,
    private readonly page: Page,
    private readonly maxAttempts: number,
    private n = 0,
  ) {}

  step<T>(name: string, fn: () => Promise<T>, summarize?: (r: T) => unknown): Promise<T> {
    const n = ++this.n;
    return withRetry(async (attempt) => {
      const startedAt = new Date();
      const log = async (ok: boolean, extra: { error?: string; data?: unknown }) => {
        const file = `${String(n).padStart(3, '0')}-${slug(name)}-a${attempt}.png`;
        const screenshot = await this.page
          .screenshot({
            path: path.join(this.store.screenshotsDir(this.runId), file),
            fullPage: true,
          })
          .then(() => `screenshots/${file}`)
          .catch(() => undefined);
        await this.store.appendStep({
          runId: this.runId,
          n,
          name,
          attempt,
          ok,
          startedAt: startedAt.toISOString(),
          durationMs: Date.now() - startedAt.getTime(),
          screenshot,
          ...extra,
        });
        console.log(
          `[${ok ? 'ok ' : 'ERR'}] #${n} ${name} (attempt ${attempt})${extra.error ? ' - ' + extra.error : ''}`,
        );
      };

      try {
        const result = await fn();
        await log(true, { data: summarize?.(result) });
        return result;
      } catch (err) {
        await log(false, { error: errorMessage(err) });
        throw err;
      }
    }, this.maxAttempts);
  }
}
