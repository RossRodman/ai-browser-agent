import type { RawRecord, RunMeta } from '../domain';
import { errorMessage } from '../core/errors';
import { analyzeWithRules } from '../analysis/rules';
import { analyzeWithModel, createChat } from '../analysis/model';
import { openBrowser, runCli } from './start-run';

runCli(async ({ cfg, store }) => {
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

    const chat = createChat(cfg.llm);
    if (!chat) {
      console.log('Model analysis skipped: LLM_API_KEY, LLM_MODEL or LLM_BASE_URL is not set');
    } else {
      try {
        const extra = await steps.step(
          'model analysis',
          () => analyzeWithModel(records, findings, chat),
          (r) => ({ findings: r.findings.length }),
        );
        findings.push(...extra.findings);
        proposals.push(...extra.proposals);
      } catch {
        console.warn('Model analysis failed, continuing with rule results only');
      }
    }
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
