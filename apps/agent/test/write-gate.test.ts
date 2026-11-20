import { describe, expect, it } from 'vitest';
import { WriteGate } from '../src/browser/write-gate';

const url = (p: string) => `http://localhost:3000${p}`;

describe('WriteGate', () => {
  it('allows reads in read-only mode', () => {
    const gate = new WriteGate('read_only');
    expect(gate.isAllowed('GET', url('/records'))).toBe(true);
  });

  it('allows login but blocks other writes in read-only mode', () => {
    const gate = new WriteGate('read_only');
    expect(gate.isAllowed('POST', url('/login'))).toBe(true);
    expect(gate.isAllowed('POST', url('/records/1'))).toBe(false);
    expect(gate.isAllowed('DELETE', url('/records/1'))).toBe(false);
  });

  it('refuses to open write access in read-only mode', async () => {
    const gate = new WriteGate('read_only');
    await expect(gate.withWriteAccess('/records/1', async () => {})).rejects.toThrow();
  });

  it('opens a single path only while the action runs', async () => {
    const gate = new WriteGate('write');
    expect(gate.isAllowed('POST', url('/records/1'))).toBe(false);
    await gate.withWriteAccess('/records/1', async () => {
      expect(gate.isAllowed('POST', url('/records/1'))).toBe(true);
      expect(gate.isAllowed('POST', url('/records/2'))).toBe(false);
    });
    expect(gate.isAllowed('POST', url('/records/1'))).toBe(false);
  });
});
