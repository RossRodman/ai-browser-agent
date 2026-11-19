import { describe, expect, it } from 'vitest';
import type { RawRecord } from '../src/domain';
import { analyzeWithRules, levenshtein } from '../src/analysis/rules';

const base: RawRecord = {
  id: '1',
  name: 'Olena Kovalenko',
  email: 'olena.k@example.com',
  phone: '+380501234567',
  status: 'active',
  createdAt: '2025-03-12',
  amount: '1200',
};

const now = new Date('2026-01-01');
const rules = (records: RawRecord[]) => analyzeWithRules(records, now).findings.map((f) => f.rule);

describe('analyzeWithRules', () => {
  it('returns nothing for a clean record', () => {
    expect(rules([base])).toEqual([]);
  });

  it('detects missing and invalid emails', () => {
    expect(rules([{ ...base, email: '' }])).toContain('missing_email');
    expect(rules([{ ...base, email: 'a@b' }])).toContain('invalid_email');
  });

  it('proposes email normalization', () => {
    const { proposals } = analyzeWithRules([{ ...base, email: 'OLENA.K@EXAMPLE.COM ' }], now);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ field: 'email', to: 'olena.k@example.com' });
  });

  it('proposes the closest status for a typo', () => {
    const { proposals } = analyzeWithRules([{ ...base, status: 'actve' }], now);
    expect(proposals[0]).toMatchObject({ field: 'status', from: 'actve', to: 'active' });
  });

  it('does not propose a status when nothing is close', () => {
    const r = analyzeWithRules([{ ...base, status: 'archived-by-admin' }], now);
    expect(r.findings.map((f) => f.rule)).toContain('unknown_status');
    expect(r.proposals).toHaveLength(0);
  });

  it('detects phone, date, amount and duplicates', () => {
    const found = rules([
      base,
      { ...base, id: '2' },
      { ...base, id: '3', name: 'X', email: 'x@example.com', phone: '123' },
      { ...base, id: '4', name: 'Y', email: 'y@example.com', createdAt: '2031-01-01' },
      { ...base, id: '5', name: 'Z', email: 'z@example.com', amount: '-5' },
    ]);
    expect(found).toEqual(
      expect.arrayContaining(['duplicate', 'invalid_phone', 'future_date', 'negative_amount']),
    );
  });

  it('produces stable ids', () => {
    const a = analyzeWithRules([{ ...base, status: 'actve' }], now);
    const b = analyzeWithRules([{ ...base, status: 'actve' }], now);
    expect(a.proposals[0]!.id).toBe(b.proposals[0]!.id);
  });
});

describe('levenshtein', () => {
  it('computes edit distance', () => {
    expect(levenshtein('actve', 'active')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
  });
});
