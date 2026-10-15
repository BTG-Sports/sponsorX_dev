# 2026-10-15

## rcfworks — yesterday's loose ends

- **#215** (the 2026-10-14 close-of-day log and the Stage Progress row) merged into `main_development`.
- **`FORECAST_EMAILS=on` in production:** the user ran the command.
- **The first full nightly chain (19:00 UTC, staging) ran clean.** Fact check: every figure matched. Benchmarks, suggested prices and forecasts: 0, as expected with no paid orders or active campaigns yet. Feature snapshots: 0 new for 8 athletes, because all 8 had been taken by hand after the 3S2-BE-01 deploy that day (one per athlete per day).

## rcfworks — faster CI merges (no task ID; the user's request)

**Why.** Each release waits on the required merge check twice (branch PR, then the sync PR), and every push to a working branch also started a second, identical run beside its PR's.

**Changed in `.github/workflows/ci.yml`:**
- **No duplicate runs.** A push runs CI only on `main` and `main_development`. A working branch is checked by its pull request.
- **Docs-only PRs skip the build and tests.** "Docs-only" means every file, and every renamed file's old path, is under `Memory/`, `Claude outputs/` or `graphify-out/`.
  - `documentation/` is not on the list, because tests read the RBAC matrix (`next-students.test.ts`).
  - A skipped job reports as passed, so the required check lets the PR merge.
  - If the file list can't be read, or comes back shorter than the PR's `changed_files`, everything runs.
  - Pushes to `main`, the nightly run and hand-started runs always run everything, so a deploy never rests on a skipped check.
- **The security job (secret scan and audit) still runs on every PR.**
- **`authz.coverage.test.ts`** matches the new push trigger.

**Not done (the user is still deciding):** splitting the browser tests across 4 machines (about 11 → 4 min), and splitting the merge check across machines (about 5½ → 2½ min).

**Checks:**
- The skip decision was tested on 7 sample PRs: docs-only, docs plus code, the RBAC matrix, code moved into `Memory/`, an unreadable list, a short list, and a lookalike folder.
- The local test database (embedded Postgres in the scratchpad) was rebuilt as CI builds it.
- Every CI step passed locally: security, both builds, lint, backend 210 files / 3,295 tests, web 140 / 1,531.
