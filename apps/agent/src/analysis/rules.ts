import { createHash } from 'node:crypto';
import type { EditableField, Finding, ProposedAction, RawRecord, Severity } from '../domain';

const STATUSES = ['active', 'inactive', 'pending'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+380\d{9}$/;

interface Fix {
  field: EditableField;
  to: string;
  reason: string;
}

const hash = (...parts: string[]) =>
  createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);

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

function closestStatus(status: string): string | undefined {
  const [best] = STATUSES.map((s) => ({ s, d: levenshtein(status, s) })).sort((a, b) => a.d - b.d);
  return best && best.d <= 2 ? best.s : undefined;
}

export function analyzeWithRules(records: RawRecord[], now = new Date()) {
  const findings: Finding[] = [];
  const proposals: ProposedAction[] = [];
  const seen = new Map<string, string>();

  for (const r of records) {
    const add = (rule: string, severity: Severity, message: string, fix?: Fix) => {
      const id = `f_${hash(r.id, rule)}`;
      findings.push({ id, recordId: r.id, rule, severity, message });
      if (!fix) return;
      proposals.push({
        id: `a_${hash(id, fix.field, fix.to)}`,
        findingId: id,
        recordId: r.id,
        field: fix.field,
        from: r[fix.field],
        to: fix.to,
        reason: fix.reason,
        status: 'pending',
      });
    };

    const name = r.name.trim().replace(/\s+/g, ' ');
    const email = r.email.trim().toLowerCase();
    const status = r.status.trim();
    const created = Date.parse(r.createdAt);
    const amount = r.amount.trim() ? Number(r.amount) : NaN;

    if (!name) add('empty_name', 'high', 'Name is empty');
    else if (name !== r.name)
      add('name_whitespace', 'low', 'Name has extra whitespace', {
        field: 'name',
        to: name,
        reason: 'Trim and collapse whitespace',
      });

    if (!email) add('missing_email', 'high', 'Email is missing');
    else if (!EMAIL_RE.test(email))
      add('invalid_email', 'medium', `Email "${r.email}" is not valid`);
    else if (email !== r.email)
      add('email_not_normalized', 'low', 'Email has uppercase letters or spaces', {
        field: 'email',
        to: email,
        reason: 'Lowercase and trim email',
      });

    if (!PHONE_RE.test(r.phone.trim()))
      add('invalid_phone', 'medium', `Phone "${r.phone}" does not match +380XXXXXXXXX`);

    if (!STATUSES.includes(status)) {
      const typo = closestStatus(status);
      add(
        'unknown_status',
        'medium',
        `Status "${r.status}" is not one of ${STATUSES.join(', ')}`,
        typo ? { field: 'status', to: typo, reason: `Looks like a typo of "${typo}"` } : undefined,
      );
    }

    if (Number.isNaN(created))
      add('invalid_date', 'medium', `Created date "${r.createdAt}" is not valid`);
    else if (created > now.getTime())
      add('future_date', 'medium', `Created date ${r.createdAt} is in the future`);

    if (Number.isNaN(amount))
      add('invalid_amount', 'medium', `Amount "${r.amount}" is not a number`);
    else if (amount < 0) add('negative_amount', 'high', `Amount ${amount} is negative`);

    const key = `${name.toLowerCase()}|${email}`;
    if (name && email && seen.has(key))
      add('duplicate', 'high', `Duplicate of record #${seen.get(key)} (same name and email)`);
    else if (name && email) seen.set(key, r.id);
  }

  return { findings, proposals };
}
