import { createHash } from 'node:crypto';
import type { EditableField, Finding, ProposedAction, RawRecord, Severity } from '../domain';

export const KNOWN_STATUSES = ['active', 'inactive', 'pending'] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+380\d{9}$/;

export interface AnalysisResult {
  findings: Finding[];
  proposals: ProposedAction[];
}

interface Fix {
  field: EditableField;
  to: string;
  reason: string;
}

function hash(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
    }
    prev = row;
  }
  return prev[b.length]!;
}

export function analyzeWithRules(records: RawRecord[], now = new Date()): AnalysisResult {
  const findings: Finding[] = [];
  const proposals: ProposedAction[] = [];

  const add = (
    r: RawRecord,
    rule: string,
    severity: Severity,
    message: string,
    fix?: Fix,
  ): void => {
    const id = `f_${hash(r.id, rule)}`;
    findings.push({ id, recordId: r.id, rule, severity, message, source: 'rule' });
    if (fix) {
      const from = r[fix.field];
      proposals.push({
        id: `a_${hash(id, fix.field, fix.to)}`,
        findingId: id,
        recordId: r.id,
        type: 'update_field',
        field: fix.field,
        from,
        to: fix.to,
        reason: fix.reason,
        status: 'pending',
      });
    }
  };

  const seen = new Map<string, string>();

  for (const r of records) {
    const name = r.name;
    const email = r.email;

    if (name.trim() === '') {
      add(r, 'empty_name', 'high', 'Name is empty');
    } else if (name !== name.trim() || /\s{2,}/.test(name)) {
      add(r, 'name_whitespace', 'low', 'Name has extra whitespace', {
        field: 'name',
        to: name.trim().replace(/\s+/g, ' '),
        reason: 'Trim and collapse whitespace',
      });
    }

    if (email.trim() === '') {
      add(r, 'missing_email', 'high', 'Email is missing');
    } else {
      const normalized = email.trim().toLowerCase();
      if (!EMAIL_RE.test(normalized)) {
        add(r, 'invalid_email', 'medium', `Email "${email}" is not valid`);
      } else if (normalized !== email) {
        add(r, 'email_not_normalized', 'low', 'Email has uppercase letters or spaces', {
          field: 'email',
          to: normalized,
          reason: 'Lowercase and trim email',
        });
      }
    }

    if (!PHONE_RE.test(r.phone.trim())) {
      add(r, 'invalid_phone', 'medium', `Phone "${r.phone}" does not match +380XXXXXXXXX`);
    }

    const status = r.status.trim();
    if (!(KNOWN_STATUSES as readonly string[]).includes(status)) {
      const closest = KNOWN_STATUSES.map((s) => ({ s, d: levenshtein(status, s) })).sort(
        (a, b) => a.d - b.d,
      )[0]!;
      add(
        r,
        'unknown_status',
        'medium',
        `Status "${r.status}" is not one of ${KNOWN_STATUSES.join(', ')}`,
        closest.d <= 2
          ? { field: 'status', to: closest.s, reason: `Looks like a typo of "${closest.s}"` }
          : undefined,
      );
    }

    const created = new Date(r.createdAt);
    if (Number.isNaN(created.getTime())) {
      add(r, 'invalid_date', 'medium', `Created date "${r.createdAt}" is not a valid date`);
    } else if (created > now) {
      add(r, 'future_date', 'medium', `Created date ${r.createdAt} is in the future`);
    }

    const amount = Number(r.amount);
    if (r.amount.trim() === '' || Number.isNaN(amount)) {
      add(r, 'invalid_amount', 'medium', `Amount "${r.amount}" is not a number`);
    } else if (amount < 0) {
      add(r, 'negative_amount', 'high', `Amount ${amount} is negative`);
    }

    if (name.trim() && email.trim()) {
      const key = `${name.trim().toLowerCase()}|${email.trim().toLowerCase()}`;
      const firstId = seen.get(key);
      if (firstId) {
        add(r, 'duplicate', 'high', `Duplicate of record #${firstId} (same name and email)`);
      } else {
        seen.set(key, r.id);
      }
    }
  }

  return { findings, proposals };
}
