# SponsorX — Developer Handoff

**Task `P8-PMO-05` (§38 deliverable) · 2026-10-02**

For a developer who has never seen this project. Follow it top to bottom and
you will have the platform running on your machine, the tests green, and a
change on its way to production. Each section ends where a deeper document
takes over; this one only gets you to the door.

**Verified** on 2026-10-02 by following it in a fresh clone on Windows 11
(Git Bash): install, environment files, Prisma, migrations, the three
processes (API healthy, worker seeded 7 NIL jobs, 12 packages and 14 logins,
web serving), the test suites, lint and the build. Following it found two
faults, both fixed the same day: `prisma:deploy` ignored the root `.env`, and
`frontend/.env.example` named variables the app does not read. The first
sign-in could not be completed because the Clerk development instance is at
its user cap (§4). Only installing Node differs on macOS (§2).

---

## 1 · What you are working on

SponsorX is BTG Sports Group's athlete sponsorship platform. Sponsors buy
sponsorship packages, athletes deliver on them, and fans redeem rewards at
events by scanning a QR code. Phase 1 is a *managed* marketplace: sponsors
submit briefs, and BTG staff do the matching, pricing and invoicing. Portals
exist for athletes, sponsors, properties (teams, schools), guardians of minors
and four BTG admin workspaces. **SponsorX NEXT** adds student-run school
media; it is a fifth portal.

The one loop that matters most, and that every trade-off protects (§39):

> athlete application → approval → NIL job/rate → sponsor brief → matching →
> invitation → Campaign Order → deliverable → tracking/reward → earnings →
> sponsor report

### The repo

| Path | What it is |
|---|---|
| `frontend/` | `@sponsorx/frontend` — the Next.js 16 web app. **Has no database.** Talks only to the API |
| `backend/` | `@sponsorx/backend` — the Express API (`/api/v1`), the pg-boss worker, Prisma |
| `e2e/` | Playwright browser tests |
| `documentation/` | The plan: four phase documents, runbooks, specs |
| `Claude outputs/` | The **task tracker** (`SponsorX-Full-Programme-Task-Board.xlsx`) — committed, edited by everyone |
| `Memory/` | The team's daily log — one folder per day. Capital **M** (see §7) |
| `graphify-out/` | A knowledge graph of the codebase, for search |
| `CLAUDE.md` | The project's working rules. Read it after this document |

### The stack in one table

| Concern | What | Locally |
|---|---|---|
| Web app, API, worker, Postgres, Redis | Railway (staging + production) | Docker (Postgres, Redis) + Node on your machine |
| Files (video, agreements, QR art) | Cloudflare R2 | MinIO in Docker |
| Sign-in | Clerk — identity only. **Who may do what lives in Postgres**, not Clerk | Clerk's development instance |
| Sales, invoices | Zoho CRM + Books, always through the queue — never in a request | Optional; jobs wait if unset |
| Email | Resend | Optional; sends are logged |

The job queue is **Postgres (pg-boss), not Redis**. Redis is cache and rate
limits only. The full reasoning is in `.claude/stack-decision.md`.

---

## 2 · Before you start

**Software**

- **Node 24.21.0** and npm 11. Check with `node -v`. `CLAUDE.md` § Local setup
  installs it without admin rights on macOS; on Windows use the official
  installer or `nvm-windows`.
- **Docker Desktop**, running.
- **Git**. On Windows, run the commands below in **Git Bash**.

**Access** — ask the programme owner for:

- The GitHub repository (`infinex1/sponsorX_dev`).
- The **Clerk development instance** keys (`pk_test_…`, `sk_test_…`). Without
  them nothing that needs a sign-in works locally.
- Later, for deploys only: the Railway project. Not needed to build or test.

---

## 3 · First run — about fifteen minutes

```bash
git clone https://github.com/infinex1/sponsorX_dev.git
cd sponsorX_dev
npm ci                                  # one install for both workspaces
```

**Environment files.** Two, both gitignored:

```bash
cp .env.example .env                    # the backend's — works as-is locally
cp frontend/.env.example frontend/.env.local
```

Then add the Clerk development keys to **both**:

- `.env` — `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` (the API checks
  sessions and refuses to start without them).
- `frontend/.env.local` — `CLERK_SECRET_KEY` and
  `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.

Everything else in both files has a working local default, and each optional
variable says what happens without it.

**Infrastructure, database, Prisma client:**

```bash
npm run infra:up            # Postgres, Redis, MinIO (+ its buckets) in Docker
npm run prisma:generate     # REQUIRED after every clone — see below
npm run prisma:deploy       # applies every migration to the local dev database
```

The Prisma commands read `DATABASE_URL` from the root `.env`, like every
other backend script, unless it is already set in your shell — then yours
wins.

> **Why `prisma:generate` is not optional.** The Prisma client is generated
> into `backend/src/generated/prisma/`, which is **gitignored**. A fresh clone
> has no client, so the API, the worker and 52 of the backend test files fail
> on import (`Cannot find module '../generated/prisma/client'`). `npm run
> dev:api` and `npm run build` regenerate it, but tests and the worker do not.

---

## 4 · Run it

Three processes, each in its own terminal:

```bash
npm run dev:api        # the API on http://localhost:4000 (health: /health)
npm run dev:worker     # the queue worker — and the local seed (below)
npm run dev:web        # the web app on http://localhost:3000
```

**The first worker start seeds your database**: the real price list (seven NIL
jobs, the sponsor packages) and a cast of demo people, each waiting at a step
of the loop. It is idempotent — restart the worker any time — and it refuses
to run in production.

**Signing in.** The seeded people have Clerk *test* addresses
(`…+clerk_test@example.com`): on the development instance they verify with
the code **424242**, and no email is sent. Their SponsorX row is waiting;
what does not exist yet is the **Clerk identity**. So the first time:

1. Go to http://localhost:3000/login and enter the address.
2. Clerk does not know it and shows **Create your account**. That is
   expected. Choose any password (development instance only), continue,
   and enter **424242** as the code.
3. SponsorX matches the new identity to the seeded row by its verified
   email and you land in that person's portal. From then on, sign in
   normally.

> **The development instance holds at most 100 users** — a Clerk limit, and
> on 2026-10-02 it was full: step 2 fails with "user quota exceeded", and so
> does every browser test that needs a login it has not created before.
> Delete stale test users in the Clerk dashboard → Users (the `e2e.*` and
> old QA addresses) to make room. Ask the programme owner; the production
> instance has no such cap but is never used for local work.

Seeded addresses to start with:

| Address | Who | Where they land |
|---|---|---|
| `btg.admin+clerk_test@example.com` | BTG admin | `/admin` |
| `btg.network+clerk_test@example.com` | Network manager | the application queue (Riley is waiting) |
| `harbor.coffee+clerk_test@example.com` | A sponsor | `/sponsor` |
| `riley+clerk_test@example.com` | An athlete | `/athlete` |
| `ms.patel+clerk_test@example.com` | A school advisor | NEXT advisor desk (Jordan is waiting) |

The full cast, and what each is waiting to do, is the header of
`backend/worker/jobs/seed-personas.mts`.

The API and worker can also run as **one process**, which is how they run on
Railway: `npm start -w @sponsorx/backend`. Use whichever you prefer locally.

---

## 5 · Test it

| What | Command | Needs |
|---|---|---|
| Frontend unit tests | `npm test -w @sponsorx/frontend` | Nothing |
| Backend tests, incl. the authorisation matrix | `npm run db:test`, then the line it prints | Docker up |
| Lint | `npm run lint` | Nothing |
| Build (both apps, includes typecheck) | `npm run build` | Nothing — but see the warning below |
| Browser tests | `npm run e2e:install` once, then `npm run e2e` | Docker up for the fan-flow specs |

**Backend tests never run against your dev database.** They create and
delete their own rows, and some clean up seeded rows by id (the pilot school,
for one). `npm run db:test` builds a separate `sponsorx_test` database
exactly as CI does — migrations, the SQL in `backend/prisma/sql/`, and the
flag that lets tests purge the audit log there and nowhere else — then prints
the command:

```bash
npm run db:test
DATABASE_URL=postgresql://sponsorx:sponsorx@localhost:5432/sponsorx_test npm test -w @sponsorx/backend
```

Re-run `db:test` whenever a migration lands. The suite runs about 135 files in
parallel; one ID per test file is the rule that keeps them from colliding.

> **Never run `npm run build` in a checkout whose `next dev` is running.** The
> build rewrites `frontend/.next` underneath the dev server and every route
> then answers a plain-text 500 until it is restarted — easily mistaken for a
> bug in whatever you just changed. Stop `dev:web` first, or build in a
> second checkout (`git worktree add`).

**Typecheck through the build, not `tsc` alone.** On a fresh checkout
`npx tsc --noEmit` in `frontend/` reports six `Cannot find name 'LayoutProps'`
errors: Next generates those types during the build.

**Browser tests start their own servers**: the web app on port 3100 (not
your 3000) and, when `DATABASE_URL` is set, the API on 4000 — reusing an
API already listening there. Point it at the test database, not the dev one.

---

## 6 · Ship a change

1. **Pick a task.** Every piece of work is a row in the tracker,
   `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`, with its
   definition and acceptance criteria in the matching
   `documentation/SponsorX-Phase{1..4}-*.md`. "Ready" means its dependencies
   are met — but grep the code for them anyway.
2. **Branch with the task ID**: `git checkout -b development/<you>/P4-FE-08`.
   Start from `main_development`.
3. **Mark it.** In the tracker, set `Status` to *In progress*, your name in
   `Owner`, and `Date Started`. Commit the xlsx with your work — it is a
   shared file, and a binary one: on a merge conflict take the other side's
   copy and re-apply your rows by hand, never discard theirs.
4. **Build it, test it** (§5). The acceptance criteria are the definition of
   done; if one is wrong, change the phase document by pull request, never by
   reinterpreting it in the tracker.
5. **Commit with the task ID** in the message:
   `feat(P4-FE-08): what changed, in words`.
6. **Log it.** Append to `Memory/<today>/tasks-completed.md` — what you did,
   what you verified, what is left. Others read it every morning.
7. **Pull request into `main_development`.** Merge from there into `main`.
8. **Close it.** Tracker row to *Code review*, then *Done* with `Date Done`.

**How it reaches production — once a day, by itself.** At 8 pm Manila the CI
workflow runs on the latest `main` (build, lint, both test suites, the
browser tests). If it passes, `deploy-daily.yml` moves the `release` branch to
that commit and Railway deploys it to staging and production. Nothing else
deploys automatically. CI does **not** run on pushes or pull requests (the
account's Actions minutes ran out on 2026-09-30); run it by hand from the
Actions tab, and run §5 locally before you merge.

To ship sooner: `npm run deploy staging` or `npm run deploy production`,
with the Railway CLI logged in. It deploys GitHub `main`, never your working
tree, and ships `api` before `web`. Details, rollback and restores:
`documentation/SponsorX-Deployment-Runbook.md`.

---

## 7 · Things that will bite you

- **`Memory/`, capital M.** On Windows, `git add memory/…` silently stages
  nothing because git tracks the folder as `Memory/`.
- **Two Prisma clients.** Never import `@prisma/client` directly; import
  `backend/src/db/client`, which uses the generated client and the pg
  adapter.
- **Every protected record is tenant-scoped**, and the tenant-isolation and
  authorisation-matrix suites will fail your change if a new route can be
  reached across tenants. That is them working.
- **Zoho never sits in a request path.** Anything that talks to Zoho is a
  queued job.
- **Uploads go straight to R2 / MinIO** through presigned URLs, never through
  the API.
- **`EMAIL_FROM` must be quoted in `.env`** — the angle brackets in
  `SponsorX <noreply@sponsorx.net>` are shell redirection when anything
  sources the file.
- **No tax IDs, no bank details** are stored, by policy. Ask before a field
  looks like one.

---

## 8 · Where to read next

| To understand… | Read |
|---|---|
| The working rules, the tracker, the open decisions | `CLAUDE.md` |
| Why this stack, and what was rejected | `.claude/stack-decision.md` |
| What is planned, task by task | `documentation/SponsorX-Phase1-Managed-Marketplace.md` (and Phases 2–4) |
| Roles and permissions | `documentation/SponsorX-RBAC-Matrix.md` |
| Deploy, rollback, migration failure, restore | `documentation/SponsorX-Deployment-Runbook.md`, `SponsorX-Database-Backup-Runbook.md`, `SponsorX-Deploy-Ordering.md` |
| Monitoring | `documentation/SponsorX-Monitoring-Plan.md` |
| The project's history and decisions | `Memory/Initial Memory/` then the dated folders |
| Any "§" reference | The Master Development Blueprint v2.0 — not in this repo; on Google Drive (`CLAUDE.md` § Documentation) |
