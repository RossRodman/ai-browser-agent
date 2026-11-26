# ai-browser-agent

Browser agent that signs in to a web app, reads a table of records, finds data problems
and proposes fixes. It is **read-only by default**: nothing is written to the site until a
person approves each change. Every step is logged with a screenshot, and transient failures
are retried.

## How it works

```
scan (read-only)                approval UI                 execute (write)
────────────────                ───────────                 ───────────────
login                           review findings             re-check current value
read all pages        ──►       approve / reject /   ──►    apply single change
rules + analysis                edit each change            verify result
findings + proposals                                        log + screenshot
```

Safety is enforced in code, not by convention:

- **Write gate.** Every request from the browser goes through a network guard. In read-only
  mode any `POST/PUT/PATCH/DELETE` is aborted (except the login form). In write mode a single
  path is opened only for the duration of one approved action.
- **Allowlist of action types.** Only `update_field` on known fields can be proposed or executed.
- **Stale check.** Before writing, the current value is compared with the value seen during the
  scan. If the record changed, the action fails instead of overwriting.
- **Safe re-runs.** Executed actions are skipped, and a field that already has the target value is not written again.

## Requirements

- Node.js 22.12+ (see `.nvmrc`)
- npm 10 (comes with Node.js)

## Quick start

```bash
npm install
npm run setup:browsers   # downloads Chromium for Playwright
cp .env.example .env

npm run demo             # terminal 1: demo site on http://localhost:3000
npm run approval         # terminal 2: approval UI on http://localhost:4000
npm run agent:scan       # terminal 3: read-only scan
```

Open http://localhost:4000, review the run and approve changes, then:

```bash
npm run agent:execute -- --run <runId>
```

Run artifacts are stored in `runs/<runId>/`: `run.json`, `records.json`, `findings.json`,
`proposals.json` (with review decisions), `steps.jsonl` and `screenshots/`.

To test retries, start the demo site with random failures:

```bash
DEMO_FAILURE_RATE=0.3 npm run demo
```

## Project structure

```
apps/
  demo-site/            demo CRM with seeded data problems (Express)
  agent/
    src/
      domain/           zod schemas and run stores (file, Postgres)
      browser/          Playwright session, write gate, page objects
      analysis/         rule-based checks
      core/             retries, step log with screenshots, errors
      cli/              scan and execute commands
      ui/               approval UI: review actions, steps and screenshots
    test/
infra/
  docker-compose.yml    Postgres (run store) and MinIO (later phases)
```

The demo site is a separate package on purpose: the agent treats it as an external
site and must not import its code. Everything else is one product and lives in `agent`.

## Scripts

| Command                 | Description                        |
| ----------------------- | ---------------------------------- |
| `npm run demo`          | Start the demo site                |
| `npm run approval`      | Start the approval UI              |
| `npm run agent:scan`    | Read-only scan, creates a new run  |
| `npm run agent:execute` | Apply approved actions for a run   |
| `npm run db:up`         | Start Postgres (Docker)            |
| `npm run db:down`       | Stop Postgres                      |
| `npm run test`          | Unit tests (Vitest)                |
| `npm run typecheck`     | TypeScript checks for all packages |
| `npm run lint`          | ESLint                             |
| `npm run format`        | Prettier                           |

## Configuration

See `.env.example`. Main variables: `BASE_URL`, `DEMO_USER`, `DEMO_PASSWORD`, `RUNS_DIR`,
`HEADLESS`, `MAX_ATTEMPTS`, `BROWSER_PATH`, `STORE`, `DATABASE_URL`.

Runs are stored in files under `RUNS_DIR` by default (`STORE=file`). To keep them in Postgres,
run `npm run db:up` and set `STORE=postgres` and `DATABASE_URL`. Tables are created on first
use. Screenshots are always written to `RUNS_DIR`. Store tests against Postgres run only when
`DATABASE_URL` is set.

## Roadmap

- [x] Demo site with seeded problems
- [x] Read-only scan with write gate, step log and screenshots
- [x] Rule-based analysis and proposed actions
- [x] Approval UI
- [x] Execute approved actions with stale check and verification
- [x] Semantic analysis on top of rules
- [ ] Natural-language page extraction as an alternative to selectors
- [x] Postgres run store
- [ ] Object storage for screenshots
- [ ] Durable workflow orchestration (approval as a signal, activity retries)
- [x] E2E tests in CI
