# 2026-09-25 — QA third pass, and the merge that followed it (HeckerCreatives)

## QA pass 3 — new lenses on the NEXT screens (commit 51661ef)

Third full verification of the 2026-09-24 frontend work, deliberately on axes
the first two passes didn't use: an audit of the pass-2 fix commit, a
spec-conformance/copy review against the NEXT integration spec, and four new
browser dimensions (reduced-motion rendering, fr-FR hydration, WCAG 320px
reflow, accessible-name audit).

**Spec conformance (the fresh catches):**
- Four P9-FE task IDs were wrong or sat in user-visible body copy: uploads,
  self-serve prospect logging and the /s/[code] resolver all wire with
  **P9-FE-01** (the code claimed 02/03/04); the editions rack card and the
  code page carried task IDs in copy a user reads. All corrected; task IDs
  now appear only in disabled-control titles, per house rule.
- "Approved for print" / "Printed" state labels contradicted principle 10
  (free digital is the V1 product) on the very fixture that publishes
  digitally — now "Approved" / "Published".
- The public reader asserted a print run ("print edition Nov 3", "the next
  print run") for an edition still SELLING with unmet gates — now "print
  planned", per principle 11.
- **Spec §5.5 amended (flag for the lead):** `PHOTO 25` added to the points
  reason vocabulary with an amendment note. The same spec's assignment model
  includes photo deliverables, but the vocabulary omitted the reason, so
  published photo work couldn't accrue at all. If this should fold under an
  existing reason instead, say so and I'll revert both spec and fixtures.
- The student home's edition numbers gained their §22 provenance tag
  ("AdSlot ledger") — the personal figure beside them already carried one.

**Pass-2 commit audit catches:** `?open=%20` still opened the back-cover
drawer (Number(" ") is 0 — now trimmed); `role="dialog"` on a `<button>` is
nonconforming ARIA (now a div dialog wrapping the close button); the join
wizard's back button is disabled mid-submit (it could resurrect cleared
errors). Verified clean: icon paths byte-identical after the icons.ts move,
locale pins complete (remaining bare `toLocaleString` sites are all server
components), `border-muted/60` valid Tailwind v4.

**Browser lanes:** reduced-motion — every screen renders the finished still,
nothing stuck at opacity 0; fr-FR + Europe/Paris — zero hydration errors on
the locale-fixed screens (the pass-2 fix proven end-to-end); 320px reflow —
one real overflow (approvals-desk tiles; grid-item `min-w-0`, the same
implicit-track bug class as the pass-1 rail); accessible names — all
"unnamed link" hits were false positives (brand-logo links named by img alt).

## Merge: origin/main_development (507c041), nothing lost

Pulled the lead's 37 commits (Zoho CRM sync P8-INT-01..07, full authz matrix
P8-SEC-02, fan redeem P6-FE-02, marketplace P4-FE-01, cohort import, 11
backend rows to Done). Three conflicts:
- **backend/src/app.ts** — both sides independently fixed ZodError→500. Kept
  `errorBody()` (also names failing paths — /join's field mapping consumes
  `issues[]`), folded his P8-SEC-02 rationale into the comment.
- **Board xlsx** — took theirs, re-applied my seven rows (P1-FE-20/22/23/27/
  29/30 + P3-FE-01 → Code review, 2026-09-24). His 09-24 snapshot kept.
- **Memory/2026-09-24 log** — union; both developers' sections intact.

New migrations applied locally; `prisma generate` needed re-running (stale
client made his new models' `deleteMany` undefined in tests — remember this
after any schema-bearing merge).

## fix(tests) 60b29ff — his new static scans break on Windows (360743a class)

- tenant-scope + zoho-boundary excluded `"/generated/"` against backslash
  paths → the walk swept the generated Prisma client, and zoho-boundary's
  "never imports zoho" NEGATIVE assertions passed vacuously on Windows — a
  silently toothless boundary check.
- fan-pii spawned `cat` per file → past the 5s timeout on Windows; now
  readFileSync with fileURLToPath.
- authz.matrix asserted SUPER_ADMIN sees exactly two fixture rows — no dev
  database with seed or E2E rows can pass; scoped to the suite's fixtures,
  still proving both tenants visible.

**Standing rule worth keeping: any new repo-scanning test must build paths
with `fileURLToPath` and compare with normalized separators — this is the
third time the backslash class has bitten.**

## Where everything stands

Backend **1232/1232**, frontend **109/109**, lint clean, production build
verified (exit code checked bare, dev server stopped for the build). Board:
Stage Progress snapshot 2026-09-25 appended (Done 139 · 308 days — unchanged;
today was QA + merge, nothing moved to Done). Google Sheet still needs its
hand mirror at end of day. Unpushed: 20 commits (three QA passes, the merge,
test fixes) — the push is HeckerCreatives' own step.

Flag for the lead alongside the §5.5 amendment: `npm test` in backend/ now
requires DATABASE_URL in the shell (his env.ts validates at import; the
dev/start scripts load ../.env but the test script doesn't) — worked around
locally by exporting from ../.env; consider `--env-file` on the test script.

## Tracker notifications — Slack + published Sheet (rcfworks)

`scripts/tracker/tracker_sync.py` (12 tests) reads the committed tracker and:
- **on every push to `main` that changes it** (`.github/workflows/tracker-notify.yml`)
  posts to Slack the phase progress table (Phase 1 **includes SponsorX NEXT** —
  user decision) plus exactly the tasks that changed, and writes those changes
  into the published Google Sheet (Status, dates, Owner, Notes by task ID; new
  tasks appended);
- **weekdays 9 pm Manila** (`tracker-digest.yml`) posts the digest and appends
  the day's Stage Progress row to the Sheet (creating that tab the first time).

The Sheet is written through an Apps Script web app bound to it
(`sheet-endpoint.gs`, deployed with clasp) because the icarrefound.org Google
organisation blocks service-account keys. Secrets on the repo:
`SLACK_WEBHOOK_URL`, `SHEET_ENDPOINT_URL`, `SHEET_ENDPOINT_SECRET`.

A one-off `sync-all` brought the Sheet level with the tracker (1,675 cells,
73 rows added, 0 status mismatches after) and its Dashboard formulas were widened
to row 400 (they stopped at the old last row: showed 125 done instead of 139).
Nine legal rows (`*-LEG-*`) stay on the Sheet's phase tabs by user decision —
reviewed when Phase 1 finishes. **The end-of-day manual Sheet mirror is no
longer needed** once both workflows are live.

## P8-OPS-02 — fan QR page load test (rcfworks) → Code review

`documentation/SponsorX-Fan-QR-Load-Test.md`. On staging (edge sin1 → origin
us-east4), autocannon bursts of 1/25/50/100/200 simultaneous fans on
`/r/<token>`: up to **537 loads/s, 0 errors of 16,116**, median ~355 ms (that is
the round trip from Manila, not server time), slowest 2.5% 480 ms. **Cloudflare
Workers trigger deferred with data** — threshold now written: slowest 2.5% >
800 ms or >1% errors at the expected event peak (~25 loads/s); tested >20× it.

**Bug found and fixed first (#64/#65):** the fan-IP forwarding keyed rate
limits on the last `X-Forwarded-For` hop, which on Railway is Railway's edge
node (152.233.33.x) — every fan through one edge shared 120 views/min; a
50-fan burst had 75% refused. Now `X-Real-IP` (set by Railway, unspoofable):
verified forged headers ignored, one visitor gets exactly 120 then refusals.
`RATE_LIMIT_MULTIPLIER` (default 1, loosen-only) was set ×1000 on staging for
the test, then removed and the API redeployed — **a variable removal alone does
not restart the service; redeploy explicitly.** LOADTEST data deleted.

**`P8-OPS-02` → Done** (user's instruction; both acceptance clauses met). Stage Progress row for 2026-09-25 recorded.
