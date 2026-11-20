import { parseArgs } from 'node:util';
import { recordPath } from '../browser/demo-site';
import { StaleRecordError, errorMessage } from '../core/errors';
import { openBrowser, runCli, setup } from './start-run';

runCli(async () => {
  const runId = parseArgs({ options: { run: { type: 'string' } } }).values.run;
  if (!runId) throw new Error('Usage: execute --run <runId>');

  const { cfg, store } = setup();
  const run = await store.getRun(runId);
  const proposals = await store.getProposals(runId);
  const todo = proposals.filter((p) => p.status === 'approved');
  if (todo.length === 0) {
    console.log('Nothing approved to execute.');
    return;
  }

  await store.saveRun({ ...run, status: 'executing', mode: 'write' });
  const { session, site, steps, login } = await openBrowser(cfg, store, runId, 'write');

  try {
    await login();

    for (const action of todo) {
      const { recordId, field, from, to } = action;
      const label = `#${recordId} ${field}`;
      try {
        await steps.step(`apply ${label}`, async () => {
          const current = await site.readField(recordId, field);
          if (current === to) return;
          if (current !== from)
            throw new StaleRecordError(`Expected "${from}", found "${current}"`);
          await session.gate.withWriteAccess(recordPath(recordId), () =>
            site.updateField(recordId, field, to),
          );
        });
        await steps.step(`verify ${label}`, async () => {
          const current = await site.readField(recordId, field);
          if (current !== to) throw new Error(`Value is "${current}", expected "${to}"`);
        });
        action.status = 'executed';
        delete action.error;
      } catch (err) {
        action.status = 'failed';
        action.error = errorMessage(err);
      }
      await store.saveProposals(runId, proposals);
    }

    const failed = todo.filter((p) => p.status === 'failed').length;
    await store.saveRun({
      ...run,
      status: failed > 0 ? 'failed' : 'completed',
      mode: 'write',
      finishedAt: new Date().toISOString(),
      error: failed > 0 ? `${failed} action(s) failed` : undefined,
    });
    console.log(`Executed: ${todo.length - failed}, failed: ${failed}`);
  } catch (err) {
    await store.saveRun({ ...run, status: 'failed', mode: 'write', error: errorMessage(err) });
    throw err;
  } finally {
    await session.close();
  }
});
