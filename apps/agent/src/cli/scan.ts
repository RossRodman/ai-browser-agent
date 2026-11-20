import type { RawRecord, RunMeta } from '../domain';
import { errorMessage } from '../core/errors';
import { analyzeWithRules } from '../analysis/rules';
import { openBrowser, runCli, setup } from './start-run';

runCli(async () => {
  const { cfg, store } = setup();
  const run: RunMeta = {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    status: 'running',
    mode: 'read_only',
    baseUrl: cfg.baseUrl,
    startedAt: new Date().toISOString(),
  };
  const { session, site, steps, login } = await openBrowser(cfg, store, run.id, 'read_only');
  await store.saveRun(run);
  console.log(`Run ${run.id} (read-only)`);

  try {
    await login();

    const records: RawRecord[] = [];
    for (let p = 1, pages = 1; p <= pages; p++) {
      const result = await steps.step(
        `read page ${p}`,
        () => site.readPage(p),
        (r) => ({ rows: r.rows.length }),
      );
      pages = result.pages;
      records.push(...result.rows);
    }

    const { findings, proposals } = analyzeWithRules(records);
    await store.saveRecords(run.id, records);
    await store.saveFindings(run.id, findings);
    await store.saveProposals(run.id, proposals);
    await store.saveRun({
      ...run,
      status: proposals.length > 0 ? 'awaiting_approval' : 'completed',
      finishedAt: new Date().toISOString(),
    });

    console.log(
      `Records: ${records.length}, findings: ${findings.length}, proposed actions: ${proposals.length}`,
    );
    if (session.gate.blocked.length > 0) {
      console.warn(`Blocked write attempts: ${session.gate.blocked.length}`);
    }
  } catch (err) {
    await store.saveRun({
      ...run,
      status: 'failed',
      error: errorMessage(err),
      finishedAt: new Date().toISOString(),
    });
    throw err;
  } finally {
    await session.close();
  }
});
