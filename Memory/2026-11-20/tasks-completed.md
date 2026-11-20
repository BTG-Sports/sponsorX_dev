# 2026-11-20 · tasks completed

## Yesterday's close of day restored (rcfworks)
- The 2026-11-19 Stage Progress row and end-of-day entry (34d3f8fc) were pushed to
  `docs/POL-BE-116-done` after #499 merged, so they never landed. The same thing happened the day before.
- Put on their own branches: #501 (main_development) and #502 (main).

## Dependency audit — effect overridden to 3.22.5 (rcfworks)
- A new advisory, GHSA-7589-6fvf-x4pw (high, ReDoS in `Schema.TemplateLiteral`), hit `effect`
  3.20.0, used by Prisma's config loader (`@prisma/config` pins it exactly) and, as an optional
  peer, by `@hookform/resolvers`. The production audit was clean, but every PR's audit check failed.
- A patch exists, so it was fixed rather than allowlisted: root `overrides` → `effect` 3.22.5 (same
  major). npm's own suggestion was a downgrade to Prisma 6.12.
- **npm quirk:** `npm install` kept the old lockfile entry. Deleting the entry made npm drop the
  package entirely while still reporting "up to date". The lockfile's `effect` entry was set to
  3.22.5 by hand with the registry's integrity; `npm ci` installs it, `npm ls` shows it overridden,
  and a later `npm install` leaves the lockfile alone.
- **Checked locally:** audit check clean, scanner tests, secret scan, `prisma generate`, `prisma
  validate`, `prisma migrate deploy` (portable Postgres 17), both builds, lint, backend 288 files /
  4,052 tests, frontend 210 files / 2,524 tests. e2e not run locally.
- Recorded in `documentation/SponsorX-Security-Review-2026-10.md` (Dependency scan table).

## POL-FE-103 and POL-FE-104 assigned to HeckerCreatives (rcfworks)
- When POL-BE-103 and POL-BE-104 closed on 2026-11-18, the log named their screens as
  HeckerCreatives', but the tracker's Owner was left blank, so the two Polish rows sat unassigned.
- Polish sheet rows 149 (`POL-FE-103`, the school advisor's Profile page in `/advisor`) and 151
  (`POL-FE-104`, the school team's page in the property portal): Owner set to HeckerCreatives,
  still Ready. Their backend is Done and live.
- `5S1-FE-02` (certified-recruiting.com's footer) stays unowned for now: it's a GoDaddy editor
  change, not code in this repo, and needs whoever holds that login.
- `5S1-FE-02` (certified-recruiting.com's footer, GoDaddy editor): Owner set to HeckerCreatives on
  the user's decision. Still Ready.
