import { mkdir, readFile, readdir, writeFile, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { Finding, ProposedAction, RawRecord, RunMeta, StepLog } from './schemas';

export class RunStore {
  constructor(private readonly root: string) {}

  dir(runId: string): string {
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
    const runs: RunMeta[] = [];
    for (const id of ids) {
      const meta = await this.readOptional(id, 'run.json', RunMeta);
      if (meta) runs.push(meta);
    }
    return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
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

  async appendStep(step: StepLog): Promise<void> {
    await appendFile(path.join(this.dir(step.runId), 'steps.jsonl'), JSON.stringify(step) + '\n');
  }

  async getSteps(runId: string): Promise<StepLog[]> {
    const file = path.join(this.dir(runId), 'steps.jsonl');
    if (!existsSync(file)) return [];
    const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
    return lines.map((l) => StepLog.parse(JSON.parse(l)));
  }

  private async read<T>(runId: string, file: string, schema: z.ZodType<T>): Promise<T> {
    const raw = await readFile(path.join(this.dir(runId), file), 'utf8');
    return schema.parse(JSON.parse(raw));
  }

  private async readOptional<T>(
    runId: string,
    file: string,
    schema: z.ZodType<T>,
  ): Promise<T | undefined> {
    const full = path.join(this.dir(runId), file);
    if (!existsSync(full)) return undefined;
    return this.read(runId, file, schema);
  }

  private async write(runId: string, file: string, data: unknown): Promise<void> {
    await mkdir(this.dir(runId), { recursive: true });
    await writeFile(path.join(this.dir(runId), file), JSON.stringify(data, null, 2));
  }
}
