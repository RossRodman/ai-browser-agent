import { afterAll, beforeAll, expect, it } from 'vitest';
import { startApp } from './helpers';

let app: Awaited<ReturnType<typeof startApp>>;

beforeAll(async () => {
  app = await startApp();
});

afterAll(() => app.stop());

it('applies only approved changes', async () => {
  expect(await app.scan()).toContain('Records: 20, findings: 9, proposed actions: 2');

  const run = await app.lastRun();
  const status = run.proposals.find((p) => p.field === 'status')!;
  const email = run.proposals.find((p) => p.field === 'email')!;

  await app.decide(run.id, status.id, 'approved');
  await app.decide(run.id, email.id, 'rejected');

  expect(await app.execute(run.id)).toContain('Executed: 1, failed: 0');
  expect(await app.readField(status.recordId, 'status')).toBe('active');
  expect(await app.readField(email.recordId, 'email')).toBe(email.from);

  expect(await app.execute(run.id)).toContain('Nothing approved to execute.');
});

it('blocks writes in read-only mode', async () => {
  const before = await app.readField('1', 'name');
  const { site, close } = await app.readOnlySite();

  await expect(site.updateField('1', 'name', 'Changed')).rejects.toThrow();
  await close();

  expect(await app.readField('1', 'name')).toBe(before);
});
