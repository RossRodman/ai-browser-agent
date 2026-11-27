import express from 'express';
import { loadConfig } from '../config';
import { createStore } from '../domain';
import {
  SESSION_TTL_MS,
  createSession,
  parseReviewers,
  requireUser,
  sameOrigin,
  sessionCookie,
  verifyPassword,
} from './auth';

const cfg = loadConfig();

const PORT = Number(process.env.APPROVAL_PORT ?? 4000);
const reviewers = parseReviewers(cfg.reviewers);
if (reviewers.size === 0 || cfg.sessionSecret.length < 16) {
  console.error(
    'Approval UI needs REVIEWERS and SESSION_SECRET (16+ characters) in .env.\n' +
      'Create a password hash with: npm run reviewer:hash -- <password>',
  );
  process.exit(1);
}
const auth = requireUser(cfg.sessionSecret);

const store = createStore(cfg);
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use('/files', auth, express.static(cfg.runsDir));

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function layout(title: string, body: string, user?: string): string {
  const header = user
    ? `<form method="post" action="/logout" style="float:right">Signed in as <b>${esc(user)}</b> <button>Sign out</button></form>`
    : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:system-ui,sans-serif;margin:2rem;color:#222;max-width:1200px}
  table{border-collapse:collapse;width:100%;margin-bottom:2rem}
  th,td{border:1px solid #ddd;padding:.4rem .6rem;text-align:left;font-size:14px;vertical-align:top}
  th{background:#f5f5f5}
  code{background:#f3f3f3;padding:0 .25rem}
  .pending{color:#8a6d00}.approved{color:#0b6}.rejected{color:#999}.executed{color:#06c}.failed{color:#c00}
  .high{color:#c00}.medium{color:#a60}.low{color:#666}
  .source-model{background:#eef;padding:0 .3rem;border-radius:3px}
  img{max-width:240px;border:1px solid #ddd}
</style></head><body>${header}${body}</body></html>`;
}

app.get('/login', (req, res) => {
  const next = esc(encodeURIComponent(String(req.query.next ?? '/')));
  res.send(
    layout(
      'Sign in',
      `<h1>Sign in</h1>
      <form method="post" action="/login?next=${next}">
        <p><label>Username <input name="username" autocomplete="username"></label></p>
        <p><label>Password <input name="password" type="password" autocomplete="current-password"></label></p>
        <button>Sign in</button>
      </form>`,
    ),
  );
});

app.post('/login', sameOrigin, (req, res) => {
  const { username = '', password = '' } = req.body as Record<string, string>;
  const hash = reviewers.get(username);
  if (!hash || !verifyPassword(password, hash)) {
    res
      .status(401)
      .send(
        layout(
          'Sign in',
          '<h1>Sign in</h1><p>Wrong username or password. <a href="/login">Try again</a></p>',
        ),
      );
    return;
  }
  const token = createSession(username, cfg.sessionSecret);
  res.setHeader('Set-Cookie', sessionCookie(token, SESSION_TTL_MS));
  const next = String(req.query.next ?? '/');
  res.redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
});

app.post('/logout', sameOrigin, (_req, res) => {
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  res.redirect('/login');
});

const source = (s: string) => `<small class="source-${esc(s)}">${esc(s)}</small>`;

function table(headers: string[], rows: string[], empty = 'None'): string {
  const head = headers.map((h) => `<th>${h}</th>`).join('');
  const body = rows.join('') || `<tr><td colspan="${headers.length}">${empty}</td></tr>`;
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

app.get('/', auth, async (_req, res) => {
  const runs = await store.listRuns();
  const rows = runs.map(
    (r) => `<tr>
      <td><a href="/runs/${esc(r.id)}">${esc(r.id)}</a></td>
      <td>${esc(r.status)}</td><td>${esc(r.mode)}</td>
      <td>${esc(r.startedAt)}</td><td>${esc(r.error)}</td>
    </tr>`,
  );
  res.send(
    layout(
      'Runs',
      `<h1>Runs</h1>
      ${table(['Run', 'Status', 'Mode', 'Started', 'Error'], rows, 'No runs yet')}
      <p><small>Store: <code>${esc(cfg.store)}</code> · Screenshots: <code>${esc(cfg.runsDir)}</code></small></p>`,
      res.locals.user,
    ),
  );
});

app.get('/runs/:id', auth, async (req, res) => {
  const { id } = req.params as { id: string };
  const [run, findings, proposals, steps] = await Promise.all([
    store.getRun(id),
    store.getFindings(id).catch(() => []),
    store.getProposals(id).catch(() => []),
    store.getSteps(id),
  ]);
  const withAction = new Set(proposals.map((p) => p.findingId));

  const proposalRows = proposals.map((p) => {
    const finding = findings.find((f) => f.id === p.findingId);
    return `<tr>
        <td>#${esc(p.recordId)}</td>
        <td>${esc(finding?.message)} ${finding ? source(finding.source) : ''}</td>
        <td><code>${esc(p.field)}</code>: <code>${esc(p.from)}</code> → <code>${esc(p.to)}</code><br><small>${esc(p.reason)}</small></td>
        <td class="${esc(p.status)}">${esc(p.status)}${p.decidedBy ? `<br><small>${esc(p.decidedBy)}, ${esc(p.decidedAt)}</small>` : ''}${p.error ? `<br><small>${esc(p.error)}</small>` : ''}</td>
        <td>${
          p.status === 'pending'
            ? `<form method="post" action="/runs/${esc(id)}/actions/${esc(p.id)}">
                 <input name="editedTo" placeholder="${esc(p.to)}" size="18">
                 <button name="decision" value="approved">Approve</button>
                 <button name="decision" value="rejected">Reject</button>
               </form>`
            : ''
        }</td>
      </tr>`;
  });

  const otherFindings = findings
    .filter((f) => !withAction.has(f.id))
    .map(
      (f) => `<tr><td>#${esc(f.recordId)}</td><td class="${esc(f.severity)}">${esc(f.severity)}</td>
        <td><code>${esc(f.rule)}</code></td><td>${esc(f.message)}</td><td>${source(f.source)}</td></tr>`,
    );

  const stepRows = steps.map(
    (s) => `<tr>
        <td>${s.n}</td><td>${esc(s.name)}</td><td>${s.attempt}</td>
        <td class="${s.ok ? 'executed' : 'failed'}">${s.ok ? 'ok' : 'error'}</td>
        <td>${s.durationMs} ms</td><td>${esc(s.error)}${s.data ? `<code>${esc(JSON.stringify(s.data))}</code>` : ''}</td>
        <td>${s.screenshot ? `<a href="/files/${esc(id)}/${esc(s.screenshot)}" target="_blank"><img src="/files/${esc(id)}/${esc(s.screenshot)}" loading="lazy"></a>` : ''}</td>
      </tr>`,
  );

  const approved = proposals.filter((p) => p.status === 'approved').length;

  res.send(
    layout(
      `Run ${id}`,
      `<p><a href="/">← Runs</a></p>
      <h1>Run ${esc(id)}</h1>
      <p>Status: <b>${esc(run.status)}</b> · Mode: ${esc(run.mode)} · Site: ${esc(run.baseUrl)}</p>

      <h2>Proposed actions (${proposals.length})</h2>
      <p>Nothing is changed on the site until actions are approved here and the execute command is run.
      Approved now: <b>${approved}</b>.</p>
      ${table(['Record', 'Problem', 'Change', 'Status', 'Decision'], proposalRows, 'No proposals')}
      ${approved > 0 ? `<p>To apply: <code>npm run agent:execute -- --run ${esc(id)}</code></p>` : ''}

      <h2>Findings that need manual handling (${findings.length - withAction.size})</h2>
      ${table(['Record', 'Severity', 'Rule', 'Message', 'Source'], otherFindings)}

      <h2>Steps (${steps.length})</h2>
      ${table(['#', 'Step', 'Attempt', 'Result', 'Time', 'Details', 'Screenshot'], stepRows)}`,
      res.locals.user,
    ),
  );
});

app.post('/runs/:id/actions/:actionId', sameOrigin, auth, async (req, res) => {
  const { id, actionId } = req.params as { id: string; actionId: string };
  const body = req.body as Record<string, string>;
  const decision = body.decision === 'approved' ? 'approved' : 'rejected';

  const applied = await store.decide(id, actionId, {
    decision,
    editedTo: body.editedTo?.trim(),
    by: res.locals.user,
  });
  if (!applied) {
    res.status(409).send(layout('Conflict', '<p>Action not found or already processed.</p>'));
    return;
  }
  res.redirect(`/runs/${id}`);
});

app.listen(PORT, () => {
  console.log(
    `Approval UI: http://localhost:${PORT} (store: ${cfg.store}, screenshots: ${cfg.runsDir})`,
  );
});
