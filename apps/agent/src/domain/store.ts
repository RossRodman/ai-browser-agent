import type { Finding, ProposedAction, RawRecord, RunMeta, StepLog } from './schemas';

export interface Decision {
  decision: 'approved' | 'rejected';
  editedTo?: string;
  by: string;
}

export interface RunStore {
  screenshotsDir(runId: string): string;
  init(runId: string): Promise<void>;
  listRuns(): Promise<RunMeta[]>;
  getRun(runId: string): Promise<RunMeta>;
  saveRun(meta: RunMeta): Promise<void>;
  saveRecords(runId: string, records: RawRecord[]): Promise<void>;
  getFindings(runId: string): Promise<Finding[]>;
  saveFindings(runId: string, findings: Finding[]): Promise<void>;
  getProposals(runId: string): Promise<ProposedAction[]>;
  saveProposals(runId: string, proposals: ProposedAction[]): Promise<void>;
  decide(runId: string, actionId: string, decision: Decision): Promise<boolean>;
  appendStep(step: StepLog): Promise<void>;
  getSteps(runId: string): Promise<StepLog[]>;
  close(): Promise<void>;
}

export function applyDecision(p: ProposedAction, d: Decision): ProposedAction {
  return {
    ...p,
    status: d.decision,
    to: d.decision === 'approved' && d.editedTo ? d.editedTo : p.to,
    decidedBy: d.by,
    decidedAt: new Date().toISOString(),
  };
}
