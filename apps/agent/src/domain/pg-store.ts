import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { Finding, ProposedAction, RunMeta, StepLog, type RawRecord } from './schemas';
import { applyDecision, type Decision, type RunStore } from './store';

// Lock: concurrent "create table if not exists" from UI and CLI can fail.
const SCHEMA = `
select pg_advisory_xact_lock(4242);
create table if not exists runs (
  id text primary key,
  started_at text not null,
  data jsonb not null
);
create table if not exists records (
  run_id text primary key references runs(id) on delete cascade,
  data jsonb not null
);
create table if not exists findings (
  run_id text not null references runs(id) on delete cascade,
  id text not null,
  pos int not null,
  data jsonb not null,
  primary key (run_id, id)
);
create table if not exists proposals (
  run_id text not null references runs(id) on delete cascade,
  id text not null,
  pos int not null,
  status text not null,
  data jsonb not null,
  primary key (run_id, id)
);
create table if not exists steps (
  run_id text not null references runs(id) on delete cascade,
  n int not null,
  attempt int not null,
  data jsonb not null,
  primary key (run_id, n, attempt)
);`;

export class PgStore implements RunStore {
  private readonly pool: pg.Pool;
  private schema: Promise<unknown> | undefined;

  constructor(
    connectionString: string,
    private readonly screenshotsRoot: string,
  ) {
    this.pool = new pg.Pool({ connectionString });
  }

  private async ready(): Promise<void> {
    this.schema ??= this.pool.query(SCHEMA).catch((err) => {
      this.schema = undefined;
      throw err;
    });
    await this.schema;
  }

  private async query(sql: string, params: unknown[] = []) {
    await this.ready();
    return this.pool.query(sql, params);
  }

  private async transaction(fn: (db: pg.PoolClient) => Promise<void>): Promise<void> {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await fn(client);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  private replaceRows(table: 'findings' | 'proposals', runId: string, items: unknown[]) {
    const status = table === 'proposals';
    return this.transaction(async (db) => {
      await db.query(`delete from ${table} where run_id = $1`, [runId]);
      await db.query(
        `insert into ${table} (run_id, id, pos, ${status ? 'status, ' : ''}data)
         select $1, e->>'id', i - 1, ${status ? "e->>'status', " : ''}e
         from jsonb_array_elements($2::jsonb) with ordinality as t(e, i)`,
        [runId, JSON.stringify(items)],
      );
    });
  }

  screenshotsDir(runId: string): string {
    return path.join(this.screenshotsRoot, runId, 'screenshots');
  }

  async init(runId: string): Promise<void> {
    await mkdir(this.screenshotsDir(runId), { recursive: true });
  }

  async listRuns(): Promise<RunMeta[]> {
    const { rows } = await this.query('select data from runs order by started_at desc');
    return rows.map((r) => RunMeta.parse(r.data));
  }

  async getRun(runId: string): Promise<RunMeta> {
    const { rows } = await this.query('select data from runs where id = $1', [runId]);
    if (!rows[0]) throw new Error(`Run ${runId} not found`);
    return RunMeta.parse(rows[0].data);
  }

  async saveRun(meta: RunMeta): Promise<void> {
    await this.query(
      `insert into runs (id, started_at, data) values ($1, $2, $3)
       on conflict (id) do update set data = excluded.data`,
      [meta.id, meta.startedAt, meta],
    );
  }

  async saveRecords(runId: string, records: RawRecord[]): Promise<void> {
    await this.query(
      `insert into records (run_id, data) values ($1, $2)
       on conflict (run_id) do update set data = excluded.data`,
      [runId, JSON.stringify(records)],
    );
  }

  async getFindings(runId: string): Promise<Finding[]> {
    const { rows } = await this.query('select data from findings where run_id = $1 order by pos', [
      runId,
    ]);
    return rows.map((r) => Finding.parse(r.data));
  }

  saveFindings(runId: string, findings: Finding[]): Promise<void> {
    return this.replaceRows('findings', runId, findings);
  }

  async getProposals(runId: string): Promise<ProposedAction[]> {
    const { rows } = await this.query('select data from proposals where run_id = $1 order by pos', [
      runId,
    ]);
    return rows.map((r) => ProposedAction.parse(r.data));
  }

  saveProposals(runId: string, proposals: ProposedAction[]): Promise<void> {
    return this.replaceRows('proposals', runId, proposals);
  }

  async decide(runId: string, actionId: string, decision: Decision): Promise<boolean> {
    const { rows } = await this.query(
      `select data from proposals where run_id = $1 and id = $2 and status = 'pending'`,
      [runId, actionId],
    );
    if (!rows[0]) return false;
    const updated = applyDecision(ProposedAction.parse(rows[0].data), decision);
    const result = await this.query(
      `update proposals set status = $3, data = $4
       where run_id = $1 and id = $2 and status = 'pending'`,
      [runId, actionId, updated.status, updated],
    );
    return result.rowCount === 1;
  }

  async appendStep(step: StepLog): Promise<void> {
    await this.query('insert into steps (run_id, n, attempt, data) values ($1, $2, $3, $4)', [
      step.runId,
      step.n,
      step.attempt,
      step,
    ]);
  }

  async getSteps(runId: string): Promise<StepLog[]> {
    const { rows } = await this.query(
      'select data from steps where run_id = $1 order by n, attempt',
      [runId],
    );
    return rows.map((r) => StepLog.parse(r.data));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
