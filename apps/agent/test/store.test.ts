import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  FileStore,
  PgStore,
  type ProposedAction,
  type RunMeta,
  type RunStore,
} from '../src/domain';

const databaseUrl = process.env.DATABASE_URL;

const run = (id: string): RunMeta => ({
  id,
  status: 'awaiting_approval',
  mode: 'read_only',
  baseUrl: 'http://localhost:3000',
  startedAt: new Date().toISOString(),
});

const proposal = (id: string): ProposedAction => ({
  id,
  findingId: `f_${id}`,
  recordId: '18',
  field: 'status',
  from: 'actve',
  to: 'active',
  reason: 'typo',
  status: 'pending',
});

const stores: [string, (dir: string) => RunStore][] = [['file', (dir) => new FileStore(dir)]];
if (databaseUrl) stores.push(['postgres', (dir) => new PgStore(databaseUrl, dir)]);

describe.each(stores)('%s store', (_name, create) => {
  let dir: string;
  let store: RunStore;
  const id = `test-${randomUUID()}`;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'aba-store-'));
    store = create(dir);
    await store.init(id);
    await store.saveRun(run(id));
  });

  afterAll(async () => {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('saves and lists runs', async () => {
    await store.saveRun({ ...run(id), status: 'completed' });
    expect((await store.getRun(id)).status).toBe('completed');
    expect((await store.listRuns()).map((r) => r.id)).toContain(id);
    await expect(store.getRun('missing')).rejects.toThrow();
  });

  it('keeps findings and proposals in order', async () => {
    const findings = ['b', 'a', 'c'].map((f) => ({
      id: f,
      recordId: '1',
      rule: 'r',
      severity: 'low' as const,
      message: f,
      source: 'rule' as const,
    }));
    await store.saveFindings(id, findings);
    expect((await store.getFindings(id)).map((f) => f.id)).toEqual(['b', 'a', 'c']);

    await store.saveProposals(id, [proposal('p2'), proposal('p1')]);
    expect((await store.getProposals(id)).map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('applies a decision only once', async () => {
    await store.saveProposals(id, [proposal('d1')]);
    const decision = { decision: 'approved' as const, editedTo: 'pending', by: 'reviewer' };

    expect(await store.decide(id, 'd1', decision)).toBe(true);
    expect(await store.decide(id, 'd1', { ...decision, decision: 'rejected' })).toBe(false);
    expect(await store.decide(id, 'missing', decision)).toBe(false);

    expect(await store.getProposals(id)).toMatchObject([
      { id: 'd1', status: 'approved', to: 'pending', decidedBy: 'reviewer' },
    ]);
  });

  it('returns steps in order', async () => {
    const step = { runId: id, name: 's', ok: true, startedAt: '', durationMs: 1 };
    await store.appendStep({ ...step, n: 2, attempt: 1 });
    await store.appendStep({ ...step, n: 1, attempt: 2 });
    await store.appendStep({ ...step, n: 1, attempt: 1 });
    const steps = await store.getSteps(id);
    expect(steps.map((s) => `${s.n}.${s.attempt}`)).toEqual(['1.1', '1.2', '2.1']);
  });
});
