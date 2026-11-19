import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed, type DemoRecord } from './seed';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.DEMO_PORT ?? 3000);
const USER = process.env.DEMO_USER ?? 'demo';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo';
const PAGE_SIZE = 8;
const FAILURE_RATE = Number(process.env.DEMO_FAILURE_RATE ?? 0);

const records: DemoRecord[] = seed();
const sessions = new Set<string>();

const app = express();
app.use(express.urlencoded({ extended: false }));

function cookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const sid = cookie(req, 'sid');
  if (sid && sessions.has(sid)) return next();
  res.redirect('/login');
}

function chaos(_req: Request, res: Response, next: NextFunction) {
  if (FAILURE_RATE > 0 && Math.random() < FAILURE_RATE) {
    res.status(503).send(layout('Error', '<p>Service temporarily unavailable</p>'));
    return;
  }
  next();
}

const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, body: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)} · Demo CRM</title>
<style>
  body{font-family:system-ui,sans-serif;margin:2rem;color:#222}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left;font-size:14px}
  th{background:#f5f5f5}
  form.inline{display:inline}
  label{display:block;margin:.5rem 0}
  input,select{padding:.3rem;min-width:260px}
  .pager a{margin-right:.5rem}
</style></head>
<body><h1>${esc(title)}</h1>${body}</body></html>`;
}

app.get('/', (_req, res) => res.redirect('/records'));

app.get('/login', (_req, res) => {
  res.send(
    layout(
      'Sign in',
      `<form method="post" action="/login" data-testid="login-form">
        <label>Username <input name="username" data-testid="username" autocomplete="username"></label>
        <label>Password <input name="password" type="password" data-testid="password" autocomplete="current-password"></label>
        <button type="submit" data-testid="login-submit">Sign in</button>
      </form>`,
    ),
  );
});

app.post('/login', (req, res) => {
  const { username, password } = req.body as Record<string, string>;
  if (username !== USER || password !== PASSWORD) {
    res.status(401).send(layout('Sign in', '<p data-testid="login-error">Invalid credentials</p>'));
    return;
  }
  const sid = randomUUID();
  sessions.add(sid);
  res.setHeader('Set-Cookie', `sid=${sid}; HttpOnly; Path=/; SameSite=Lax`);
  res.redirect('/records');
});

app.post('/logout', (req, res) => {
  const sid = cookie(req, 'sid');
  if (sid) sessions.delete(sid);
  res.setHeader('Set-Cookie', 'sid=; Path=/; Max-Age=0');
  res.redirect('/login');
});

app.get('/records', requireAuth, chaos, (req, res) => {
  const pages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(req.query.page ?? 1)));
  const slice = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const rows = slice
    .map(
      (r) => `<tr data-testid="record-row" data-id="${r.id}">
        <td data-col="id">${r.id}</td>
        <td data-col="name">${esc(r.name)}</td>
        <td data-col="email">${esc(r.email)}</td>
        <td data-col="phone">${esc(r.phone)}</td>
        <td data-col="status">${esc(r.status)}</td>
        <td data-col="createdAt">${esc(r.createdAt)}</td>
        <td data-col="amount">${r.amount}</td>
        <td><a href="/records/${r.id}/edit" data-testid="edit-link">Edit</a></td>
      </tr>`,
    )
    .join('');

  const pager = Array.from({ length: pages }, (_, i) => i + 1)
    .map((p) =>
      p === page
        ? `<strong data-testid="current-page">${p}</strong>`
        : `<a href="/records?page=${p}" data-testid="page-link">${p}</a>`,
    )
    .join(' ');

  res.send(
    layout(
      'Customers',
      `<table data-testid="records-table">
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Created</th><th>Amount</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="pager" data-testid="pager" data-pages="${pages}">Page: ${pager}</p>
      <form method="post" action="/logout" class="inline"><button>Sign out</button></form>`,
    ),
  );
});

app.get('/records/:id/edit', requireAuth, chaos, (req, res) => {
  const r = records.find((x) => x.id === Number(req.params.id));
  if (!r) {
    res.status(404).send(layout('Not found', '<p>Record not found</p>'));
    return;
  }
  const field = (name: keyof DemoRecord, label: string) =>
    `<label>${label} <input name="${name}" value="${esc(r[name])}" data-testid="field-${name}"></label>`;
  res.send(
    layout(
      `Edit #${r.id}`,
      `<form method="post" action="/records/${r.id}" data-testid="edit-form">
        ${field('name', 'Name')}
        ${field('email', 'Email')}
        ${field('phone', 'Phone')}
        ${field('status', 'Status')}
        ${field('amount', 'Amount')}
        <button type="submit" data-testid="save">Save</button>
        <a href="/records">Cancel</a>
      </form>`,
    ),
  );
});

app.post('/records/:id', requireAuth, chaos, (req, res) => {
  const r = records.find((x) => x.id === Number(req.params.id));
  if (!r) {
    res.status(404).send(layout('Not found', '<p>Record not found</p>'));
    return;
  }
  const body = req.body as Record<string, string>;
  if (body.name !== undefined) r.name = body.name;
  if (body.email !== undefined) r.email = body.email;
  if (body.phone !== undefined) r.phone = body.phone;
  if (body.status !== undefined) r.status = body.status;
  if (body.amount !== undefined && body.amount !== '') r.amount = Number(body.amount);
  res.redirect('/records');
});

app.post('/__reset', (_req, res) => {
  records.splice(0, records.length, ...seed());
  res.json({ ok: true, count: records.length });
});

app.listen(PORT, () => {
  console.log(`Demo site: http://localhost:${PORT} (user: ${USER})`);
});
