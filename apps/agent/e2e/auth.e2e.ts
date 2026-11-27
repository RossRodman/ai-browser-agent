import { afterAll, beforeAll, expect, it } from 'vitest';
import { startApp } from './helpers';

let app: Awaited<ReturnType<typeof startApp>>;

beforeAll(async () => {
  app = await startApp();
});

afterAll(() => app.stop());

it('asks to sign in before showing runs and screenshots', async () => {
  for (const page of ['/', '/runs/any', '/files/any/screenshots/001.png']) {
    const res = await app.get(page);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toMatch(/^\/login/);
  }
});

it('rejects a wrong password', async () => {
  expect(await app.signIn('wrong')).toBeUndefined();
});

it('accepts decisions only from a signed-in reviewer on this site', async () => {
  await app.scan();
  const run = await app.lastRun();
  const action = run.proposals[0]!;

  const anonymous = await app.decide(run.id, action.id, 'approved', { cookie: '' });
  expect(anonymous.headers.get('location')).toMatch(/^\/login/);

  const foreign = await app.decide(run.id, action.id, 'approved', {
    origin: 'http://evil.example',
  });
  expect(foreign.status).toBe(403);

  expect((await app.lastRun()).proposals[0]?.status).toBe('pending');

  expect((await app.decide(run.id, action.id, 'approved')).status).toBe(302);
  expect((await app.lastRun()).proposals[0]).toMatchObject({
    status: 'approved',
    decidedBy: 'e2e',
  });
});
