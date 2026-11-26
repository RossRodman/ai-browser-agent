import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Finding, ProposedAction, RunMeta, StepLog, type RawRecord } from './schemas';
import { applyDecision, type Decision, type RunStore } from './store';

export class FileStore implements RunStore {
  constructor(private readonly root: string) {}

  private dir(runId: string): string {
    return path.join(this.root, runId);
  }

  screenshotsDir(runId: string): string {
    return path.join(this.dir(runId), 'screenshots');
  }

  async init(runId: string): Promise<void> {
    await mkdir(this.screenshotsDir(runId), { recursive: true });
  }

  async listRuns(): Promise<RunMeta[]> {
    if (!existsSync(this.root)) return [];
    const ids = await readdir(this.root);
    const runs = await Promise.all(
      ids.map((id) => this.read(id, 'run.json', RunMeta).catch(() => undefined)),
    );
    return runs
      .filter((r): r is RunMeta => r !== undefined)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  getRun(runId: string) {
    return this.read(runId, 'run.json', RunMeta);
  }
  saveRun(meta: RunMeta) {
    return this.write(meta.id, 'run.json', meta);
  }

  saveRecords(runId: string, records: RawRecord[]) {
    return this.write(runId, 'records.json', records);
  }

  getFindings(runId: string) {
    return this.read(runId, 'findings.json', z.array(Finding));
  }
  saveFindings(runId: string, findings: Finding[]) {
    return this.write(runId, 'findings.json', findings);
  }

  getProposals(runId: string) {
    return this.read(runId, 'proposals.json', z.array(ProposedAction));
  }
  saveProposals(runId: string, proposals: ProposedAction[]) {
    return this.write(runId, 'proposals.json', proposals);
  }

  async decide(runId: string, actionId: string, decision: Decision): Promise<boolean> {
    const proposals = await this.getProposals(runId);
    const i = proposals.findIndex((p) => p.id === actionId && p.status === 'pending');
    if (i < 0) return false;
    proposals[i] = applyDecision(proposals[i]!, decision);
    await this.saveProposals(runId, proposals);
    return true;
  }

  async appendStep(step: StepLog): Promise<void> {
    await appendFile(path.join(this.dir(step.runId), 'steps.jsonl'), JSON.stringify(step) + '\n');
  }

  async getSteps(runId: string): Promise<StepLog[]> {
    const file = path.join(this.dir(runId), 'steps.jsonl');
    if (!existsSync(file)) return [];
    const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
    return lines
      .map((l) => StepLog.parse(JSON.parse(l)))
      .sort((a, b) => a.n - b.n || a.attempt - b.attempt);
  }

  async close(): Promise<void> {}

  private async read<T>(runId: string, file: string, schema: z.ZodType<T>): Promise<T> {
    const raw = await readFile(path.join(this.dir(runId), file), 'utf8');
    return schema.parse(JSON.parse(raw));
  }

  private async write(runId: string, file: string, data: unknown): Promise<void> {
    await mkdir(this.dir(runId), { recursive: true });
    await writeFile(path.join(this.dir(runId), file), JSON.stringify(data, null, 2));
  }
}
