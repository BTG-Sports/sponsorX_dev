# 2026-10-14

## rcfworks — yesterday's deploy and the first nightly fact check

- The 12:03 UTC Daily deploy was skipped because CI on #203 had not finished. The **19:03 UTC** run deployed `6626d0d` (#203) to staging and production.
- **Staging, worker log:** `fact check: nightly at 19:00 UTC; emails on.` then `fact check 2026-10-13: every figure matches the app; 0 email(s)`.
- **Production:** not read, because the safety system blocks production logs. The user can check it with:

  ```
  railway logs --environment production --service api | grep -i "fact check"
  ```

## rcfworks — 3S1-OPS-03 · only the app writes to the live database (In progress)

**Before.** One login, `postgres`, a superuser, is used by:
- the api service (the API, the worker and the pre-deploy `prisma migrate deploy`);
- the staging `tester` service (`STAGING_DATABASE_URL`);
- anyone who uses `railway ssh`.

Neither database has a public address: staging's Postgres has no TCP proxy and no `DATABASE_PUBLIC_URL`. All 104 public tables and 12 `pgboss` tables are owned by `postgres`.

**Decision (user, 2026-10-14).** Two logins, not three. The app's own login also applies new tables at deploy. The user's words: "we would be constantly changing the shape while we are in development, so there is no need for a special user". The tester site uses the app's login.

**Built:**
- `backend/src/db/logins.ts`:
  - `applyLogins` creates or updates `sponsorx_app` (not a superuser) and makes it owner of the database, every schema, table, sequence, function, enum and domain;
  - `sponsorx_readonly` gets SELECT on every schema plus default privileges, so tables added later are readable too. CREATE is revoked from PUBLIC, and `default_transaction_read_only` is on;
  - `checkLogins` proves it all, logged in as each login.
- `npm run db:logins`:
  - takes the passwords as JSON on stdin, never in argv;
  - runs as the master login and refuses to run otherwise;
  - prints only counts and checks, and exits 1 if a check fails.
- `npm run db:read -- 'SQL'`: people's queries, run through `READONLY_DATABASE_URL` in a READ ONLY transaction that is rolled back.
- `backend/tests/db-logins.test.ts` (8 tests) uses a scratch database built by every migration plus pg-boss' schema, as the master login, like staging and production. It shows that:
  - the check passes;
  - the read-only login is refused INSERT, UPDATE and DELETE (including on `pgboss.job`), `DISABLE TRIGGER` on Fact, and CREATE TABLE, even with read-only switched off;
  - `prisma migrate deploy` runs as the app;
  - pg-boss starts, sends and fetches as the app;
  - the app can read `pg_stat_archiver` (system health);
  - a table the app adds later is readable by people and not writable;
  - a re-run hands over an object the master login made;
  - only the master login can apply it.
- **Docs:**
  - Deployment Runbook §6 covers the logins, where the passwords live (on the database service, referenced from api), the setup steps, undo and break-glass;
  - Fact Ledger v1.8, §10;
  - the Phase 3 plan entry;
  - `.env.example`.
- **Tracker:** 3S1-OPS-03 is In progress, rcfworks, started 2026-10-14.

**Note (disclosure).** While listing staging's Postgres variables, a redaction regex failed, and the staging master password was printed into the session output. It went nowhere else. It will be changed when staging is switched over.

**Next:**
1. PR, merge and deploy.
2. Staging: passwords on `Postgres`, then `db:logins`, then switch `api` and `tester`, then health, `facts:check` and `db:read`.
3. Change the staging master password.
4. Production: the user runs the commands.
