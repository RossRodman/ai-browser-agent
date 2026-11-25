import { z } from 'zod';

export const RunMode = z.enum(['read_only', 'write']);
export type RunMode = z.infer<typeof RunMode>;

const RunStatus = z.enum(['running', 'awaiting_approval', 'executing', 'completed', 'failed']);

export const RawRecord = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  status: z.string(),
  createdAt: z.string(),
  amount: z.string(),
});
export type RawRecord = z.infer<typeof RawRecord>;

export const EditableField = z.enum(['name', 'email', 'phone', 'status', 'amount']);
export type EditableField = z.infer<typeof EditableField>;

export const Severity = z.enum(['low', 'medium', 'high']);
export type Severity = z.infer<typeof Severity>;

export const Finding = z.object({
  id: z.string(),
  recordId: z.string(),
  rule: z.string(),
  severity: Severity,
  message: z.string(),
  source: z.enum(['rule', 'model']).default('rule'),
});
export type Finding = z.infer<typeof Finding>;

export const ProposedAction = z.object({
  id: z.string(),
  findingId: z.string(),
  recordId: z.string(),
  field: EditableField,
  from: z.string(),
  to: z.string(),
  reason: z.string(),
  status: z.enum(['pending', 'approved', 'rejected', 'executed', 'failed']),
  decidedBy: z.string().optional(),
  decidedAt: z.string().optional(),
  error: z.string().optional(),
});
export type ProposedAction = z.infer<typeof ProposedAction>;

export const StepLog = z.object({
  runId: z.string(),
  n: z.number().int(),
  name: z.string(),
  attempt: z.number().int(),
  ok: z.boolean(),
  startedAt: z.string(),
  durationMs: z.number(),
  screenshot: z.string().optional(),
  error: z.string().optional(),
  data: z.unknown().optional(),
});
export type StepLog = z.infer<typeof StepLog>;

export const RunMeta = z.object({
  id: z.string(),
  status: RunStatus,
  mode: RunMode,
  baseUrl: z.string(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  error: z.string().optional(),
});
export type RunMeta = z.infer<typeof RunMeta>;
