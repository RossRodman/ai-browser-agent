import { describe, expect, it } from 'vitest';
import type { Finding, RawRecord } from '../src/domain';
import { analyzeWithModel, createChat } from '../src/analysis/model';

const record: RawRecord = {
  id: '20',
  name: 'Petro Ivanenko',
  email: 'petro.i@example.com',
  phone: '+380679990011',
  status: 'inactive',
  createdAt: '2025-08-01',
  amount: '1999',
};

const known: Finding[] = [
  {
    id: 'f1',
    recordId: '20',
    rule: 'invalid_phone',
    severity: 'medium',
    message: '',
    source: 'rule',
  },
];

const reply = (findings: unknown[]) => async () => JSON.stringify({ findings });

const suspicious = {
  recordId: '20',
  rule: 'inactive_with_balance',
  severity: 'medium',
  message: 'Inactive customer has a large amount',
  fix: { field: 'status', to: 'active', reason: 'Has recent payments' },
};

describe('analyzeWithModel', () => {
  it('turns a valid reply into findings and proposals', async () => {
    const r = await analyzeWithModel([record], known, reply([suspicious]));
    expect(r.findings).toEqual([expect.objectContaining({ recordId: '20', source: 'model' })]);
    expect(r.proposals).toEqual([
      expect.objectContaining({ field: 'status', from: 'inactive', to: 'active' }),
    ]);
  });

  it('drops unknown records, repeated rules and unknown fields', async () => {
    const r = await analyzeWithModel(
      [record],
      known,
      reply([
        { ...suspicious, recordId: '999' },
        { ...suspicious, rule: 'invalid_phone' },
      ]),
    );
    expect(r.findings).toHaveLength(0);

    await expect(
      analyzeWithModel(
        [record],
        known,
        reply([{ ...suspicious, fix: { ...suspicious.fix, field: 'id' } }]),
      ),
    ).rejects.toThrow();
  });

  it('keeps the finding but drops a fix that changes nothing', async () => {
    const fix = { field: 'status', to: 'inactive', reason: 'same' };
    const r = await analyzeWithModel([record], known, reply([{ ...suspicious, fix }]));
    expect(r.findings).toHaveLength(1);
    expect(r.proposals).toHaveLength(0);
  });

  it('reads JSON wrapped in text and rejects broken replies', async () => {
    const wrapped = async () => 'Here you go:\n' + JSON.stringify({ findings: [suspicious] });
    expect((await analyzeWithModel([record], known, wrapped)).findings).toHaveLength(1);
    await expect(analyzeWithModel([record], known, async () => 'no json')).rejects.toThrow();
  });
});

describe('createChat', () => {
  it('is disabled without key, model or url', () => {
    expect(createChat({ apiKey: '', model: 'm', baseUrl: 'http://x' })).toBeUndefined();
    expect(createChat({ apiKey: 'k', model: '', baseUrl: 'http://x' })).toBeUndefined();
    expect(createChat({ apiKey: 'k', model: 'm', baseUrl: '' })).toBeUndefined();
  });
});
