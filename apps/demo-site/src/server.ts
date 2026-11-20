import express, { type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from './seed';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = Number(process.env.DEMO_PORT ?? 3000);
const USER = process.env.DEMO_USER ?? 'demo';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo';
const FAILURE_RATE = Number(process.env.DEMO_FAILURE_RATE ?? 0);
const PAGE_SIZE = 8;
const FIELDS = ['name', 'email', 'phone', 'status', 'amount'] as const;

const records = seed();
const token = randomUUID();

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const page = (title: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:2rem}
  table{border-collapse:collapse}
  th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left}
  label{display:block;margin:.5rem 0}
</style></head>
<body><h1>${esc(title)}</h1>${body}</body></html>`;

function auth(req: Request, res: Response, next: NextFunction) {
  if (req.headers.cookie?.includes(`sid=${token}`)) return next();
  res.redirect('/login');
}

function chaos(_req: Request, res: Response, next: NextFunction) {
  if (Math.random() < FAILURE_RATE) {
    res.status(503).send(page('Error', '<p>Service temporarily unavailable</p>'));
    return;
  }
  next();
}

function findRecord(req: Request, res: Response) {
  const record = records.find((r) => r.id === Number(req.params.id));
  if (!record) res.status(404).send(page('Not found', '<p>Record not found</p>'));
  return record;
}

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get('/', (_req, res) => res.redirect('/records'));

app.get('/login', (_req, res) => {
  res.send(
    page(
      'Sign in',
      `<form method="post" action="/login">
        <label>Username <input name="username" data-testid="username"></label>
        <label>Password <input name="password" type="password" data-testid="password"></label>
        <button data-testid="login-submit">Sign in</button>
      </form>`,
    ),
  );
});

app.post('/login', (req, res) => {
  if (req.body.username !== USER || req.body.password !== PASSWORD) {
    res.status(401).send(page('Sign in', '<p>Invalid credentials</p>'));
    return;
  }
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; Path=/; SameSite=Lax`);
  res.redirect('/records');
});

app.get('/records', auth, chaos, (req, res) => {
  const pages = Math.ceil(records.length / PAGE_SIZE);
  const current = Math.min(pages, Math.max(1, Number(req.query.page) || 1));
  const rows = records
    .slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
    .map(
      (r) => `<tr data-testid="record-row">
        <td data-col="id">${r.id}</td>
        ${FIELDS.map((f) => `<td data-col="${f}">${esc(r[f])}</td>`).join('')}
        <td data-col="createdAt">${esc(r.createdAt)}</td>
        <td><a href="/records/${r.id}/edit">Edit</a></td>
      </tr>`,
    )
    .join('');
  const links = Array.from({ length: pages }, (_, i) =>
    i + 1 === current ? `<b>${i + 1}</b>` : `<a href="/records?page=${i + 1}">${i + 1}</a>`,
  ).join(' ');

  res.send(
    page(
      'Customers',
      `<table data-testid="records-table">
        <tr><th>ID</th>${FIELDS.map((f) => `<th>${f}</th>`).join('')}<th>createdAt</th><th></th></tr>
        ${rows}
      </table>
      <p data-testid="pager" data-pages="${pages}">Page: ${links}</p>`,
    ),
  );
});

app.get('/records/:id/edit', auth, chaos, (req, res) => {
  const r = findRecord(req, res);
  if (!r) return;
  const inputs = FIELDS.map(
    (f) => `<label>${f} <input name="${f}" value="${esc(r[f])}" data-testid="field-${f}"></label>`,
  ).join('');
  res.send(
    page(
      `Edit #${r.id}`,
      `<form method="post" action="/records/${r.id}">
        ${inputs}
        <button data-testid="save">Save</button> <a href="/records">Cancel</a>
      </form>`,
    ),
  );
});

app.post('/records/:id', auth, chaos, (req, res) => {
  const r = findRecord(req, res);
  if (!r) return;
  const body = req.body as Record<string, string | undefined>;
  for (const f of ['name', 'email', 'phone', 'status'] as const) {
    if (body[f] !== undefined) r[f] = body[f];
  }
  if (body.amount) r.amount = Number(body.amount);
  res.redirect('/records');
});

app.listen(PORT, () => console.log(`Demo site: http://localhost:${PORT} (user: ${USER})`));
