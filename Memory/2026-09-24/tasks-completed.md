# 2026-09-24 — tasks completed

## `P1-FE-21` — the edition page map, as a live flatplan

*Code review. The design went through the visual companion (three concepts;
flatplan chosen), then an approved terminal design, then the spec:
`docs/superpowers/specs/2026-09-24-edition-page-map-design.md`.*

`/admin/next/editions` renders the Fall 2026 issue as facing spreads with ad
slots at their true positions — the editor's flatplan wall, live. Sold = solid
violet + sponsor monogram, reserved = dashed hold **naming who it is held
for**, open = quiet surface showing the rack price, editorial = stripes. The
back cover renders apart as a framed 1-of-1 with its price and the "unsellable
after close" warning. The §5.2 production gates (contentReady, rightsCleared,
revenueMet) are explicit pass/fail chips above a violet minimum-viable meter
that spells out the shortfall — $5,300 of $6,500, $1,200 to go, 16 days.

### Decisions worth recording

**The flatplan fixture is the single source, and tests make it so.**
`editionPages` (20 pages, 24 slots incl. `BACK-01`) now *derives*
`studentEdition.committedCents` — the student portal's edition card and the
admin map render projections of the same array. `tests/edition-fixtures.test.ts`
pins: Σ(sold values) = committed; counts = 11/4/9; back cover singleton; slot
codes unique; **Jordan's three attribution rows appear on the map with matching
sponsor and value**; and the two in-flight prospects (Iron Path Gym, Delgado's
Pizzeria) hold reserved slots by name. Two surfaces, one story.

**A hold names its holder.** RESERVED without `holdFor` fails the test —
a hold nobody can account for is an open slot someone is afraid to sell.

**Sale value ≠ rack price, visibly.** Rosa's quarter closed at $450 against a
$250 rack (coupon add-on); the drawer says "differs from rack — value frozen
at close." That is the `SalesAttribution` frozen-value rule surfacing in UI.

**Magazine geometry is respected.** The cover renders recto (right of the
spine), a trailing lone page verso — caught in the render-and-look pass, where
page 20 was stretching across the whole spread before the spacer fix.

**Portal chrome vs. programme color.** The screen lives in the admin portal
(steel chrome) but every NEXT inventory mark is violet — same split as the
student portal. State encoding is shape + color (fill / dashed / empty /
stripes), never color alone.

### Verification

62 frontend tests green (8 new invariants), backend untouched, build and
eslint clean. Overflow measured with headless Chrome at 390/470/768:
`scrollWidth === clientWidth` at every width (the P1-FE-19 lesson, now a
standing check — the rail here shipped with `min-w-0` from the start).
Screenshots eyeballed at 390 and 1280; the drawer, holds, monograms and gates
all render as specced. Admin nav gained "NEXT editions" (book glyph); the dev
route map lists the screen.

Board: `P1-FE-21` → Code review (HeckerCreatives, 2026-09-24), snapshot row
appended (Done 91 · 428 days — unchanged; Code review is not Done). Google
Sheet still needs its hand mirror at end of day.

---

## Leftovers from 2026-09-23 — worked through (rcfworks)

| Item | State |
|---|---|
| Leftovers queue (PR #35) | Merged into `main_development`. PR **#36** `main_development` → `main` open; `b278323` builds clean, 1077 tests pass. |
| **`External_Id` vs `SponsorX_ID`** | **Resolved: `SponsorX_ID`.** Live Zoho `Accounts` field read 2026-09-24: `SponsorX_ID` is an org-level external field; no `External_Id` exists. `P8-INT-01`'s acceptance fixed in the Phase 1 doc and the tracker (Phase 1 `P164`), plus the code sample in Implementation Guide V2. |
| graphify graph | Rebuilt (`graphify update . --force`, AST only): 3965 nodes, 287 communities, indexes `frontend/` + `backend/`, zero `src/server` nodes left. The labels for the new communities are hub names; doc changes since 21 Sep are not re-extracted semantically. |
| Four stale remote branches | Verified fully on `main` (`b6_tracking_reward`'s only extra commit is the PR #24 merge). **Not deleted** — branch deletion needs the user's permission. |
| Railway production | **Done (manual approval mode).** Production `api` instance created (Dockerfile build, pre-deploy `prisma migrate deploy`, `/health`, `PORT=4000`) and deployed at `a7bed10` — all 9 migrations applied to Postgres-production, API listening, worker up. Production `web` now builds from the workspace split (`npm run start -w @sponsorx/frontend`) and is deployed at `a7bed10`, replacing the 18 Sep `59827ee7` build. Both services now have a `main` trigger in production. **Follow-up (same day):** production `api` now carries staging's `S3_*`, `R2_PUBLIC_BASE_URL` and `RESEND_API_KEY` (user's call: reuse staging storage until Phase 2 gives production its own buckets) and was redeployed. The API's private hostname was renamed `worker` → `api` in staging (it still carried the pre-rename `worker` endpoint from 21 Sep); verified from inside both `web` containers via `railway ssh`: `api.railway.internal` resolves and `/health` returns 200 in staging and production, `worker.railway.internal` is gone. Still open: no public domain on production — `sponsorx.net` (Cloudflare DNS, no A/MX/www records, so attaching it disturbs nothing) is the recommendation, because production Clerk is a **live** instance on `clerk.sponsorx.net` and sign-in would not work on an `up.railway.app` address. |
| `P7-BE-06`, `P7-BE-02` wording, §15 `invoice` row, stage 8 (O-2/O-5/O-6) | Still business decisions — unchanged. |
| `P6-BE-05` GeoLite licence, Google Sheet mirror | Still the user's. |


**Bug found and fixed:** `/t/<unknown code>` on staging redirected to `https://localhost:8080/` — `frontend/src/app/t/[code]/route.ts` builds the fallback with `new URL("/", req.url)`, and behind Railway's proxy `req.url` is the container's own address. Fixed by returning a relative `Location: /`; `frontend/tests/tracking-redirect.test.ts` reproduces the proxied `req.url` and failed before the change.

**Railway SSH:** an ed25519 key (`~/.ssh/id_ed25519`, registered as `bob-mac`) now lets `railway ssh --environment <env> --service <svc> -- <cmd>` run commands inside containers — the only way to test the private network, since the API does not log requests and httpLogs cover public traffic only.

## Business decisions taken 2026-09-24 (user) — applied

| Item | Decision | Applied |
|---|---|---|
| **`P7-BE-06`** report render worker | **Retained and parked**, not dropped. The frontend's browser PDF (`frontend/src/lib/report-pdf.ts`) is the demo for now. | Board → Blocked with a PARKED note; Phase 1 doc gains a *Parked* line. G-07's confirmation box stays blank — nothing was decided about requiring a file. |
| **`P7-BE-02`** earning release | **Option A:** one earning per order, released in full when the **last** deliverable is verified. Deliverables are already created from the order's NIL job at acceptance (`createDeliverablesFromJob`), so each is tied to the task originally set. | Wording amended in the Phase 1 doc and the tracker to match the code. No code change. |
| **Invoice visibility** | **BTG admin and the invoiced sponsor only.** Athletes never see invoices — they see their `earning`; the invoice would expose the margin (§7.1). | New RBAC resource `invoice` (matrix §11 + `policy.ts`): SUPER_ADMIN any · BTG_ADMIN own-tenant · SPONSOR_ADMIN/ANALYST own · everyone else denied, including FINANCE, CAMPAIGN_MGR and SALES. `invoicesForCampaign` / `paymentStatusForCampaign` gate on it, with the campaign lookup still narrowing a sponsor to their own campaigns. 13 new tests; matrix digest `bc4ddbf83a1e7538` → `441c358e69d81f98`, verified that only the four `invoice` cells moved. Tracker note on `P7-BE-04`. |

Verification: `npm run build` clean; backend 1027 passed / 13 skipped, frontend 65 passed.

## Backend batch — P3-DATA-01, P6-SEC-02, P6-SEC-03, P8-PMO-01, P2-BE-09 (rcfworks)

**Scope decision first (user, 2026-09-24):** no "sponsor may contact me about offers" consent option in Phase 1. It is now Phase 2 `2S6-BE-03`, and `P6-INT-01` (consent-gated Zoho lead push) moved with it as `2S6-INT-03` — it cannot meet its acceptance without that consent. Phase 1 board row set to *Dropped* with a MOVED note; Phase 2 sheet gained the two rows (Order 52.1, 52.2 — inside the existing ranges, no formula edits). Phase 2 now 66 tasks.

| Task | State | What enforces the acceptance |
|---|---|---|
| **`P3-DATA-01`** pilot cohort import | **In progress** — built, not yet run on staging | `npm run cohort:import -w @sponsorx/backend -- file.csv` validates the whole file against `AthleteApplicationInput` and queues ONE `athlete.importCohort` job; the worker creates each athlete through `createApplicantIn` (extracted from `/join`'s `submitApplication`) → SUBMITTED, skipping existing emails. Production refuses unless the file's sha256 is in `COHORT_IMPORT_APPROVED_SHA256` (Railway's `RAILWAY_ENVIRONMENT_NAME` tells staging from production — both run NODE_ENV=production). Example file: `backend/scripts/cohort-import.example.csv`. **Next step:** after merge + staging deploy, run it on staging via `railway ssh` with 25 rows, then Code review. |
| **`P6-SEC-02`** fan PII purpose limitation | Code review | The RBAC matrix already made reward events aggregate-only for every role (§10) and fan contact BTG-only (§7.2). A first cut that listed claim rows was **withdrawn** for breaking that. Enforcement is structural: `backend/tests/fan-pii.test.ts` fails the build if any query selects `fanEmail`, reads a RewardEvent without a column list, or puts the address in a raw SQL SELECT (mutation-checked). |
| **`P6-SEC-03`** fan unsubscribe | Code review | Signed `<claimId>.<hmac>` link (`lib/unsubscribe-token.ts`, own HMAC purpose) in the `reward.claimed` body and as RFC 8058 `List-Unsubscribe` headers → web `/u/[token]` (GET = one button, never withdraws — link scanners; POST = withdraw) → `POST /api/v1/public/unsubscribe/:token` → `withdrawFanConsent` stamps `RewardEvent.consentWithdrawnAt` (migration `20260924120000`), first tap wins, audited. The email worker refuses a fan template without the link and re-checks withdrawal in SQL before sending. Fan addresses no longer appear in the worker log. AC clause 3 amended (lead push → Phase 2). |
| **`P8-PMO-01`** OpenAPI | Code review | The spec had components but **zero paths**. All 70 operations now registered in `contracts/registry.ts` with the handlers' own Zod body schemas; `tests/openapi.coverage.test.ts` walks the live Express routers and fails on an undocumented route or a phantom path. |
| **`P2-BE-09`** repo layout | Code review | AC amended to the Addendum B layout; six stale pre-split `.gitkeep` placeholders removed (they pointed at `frontend/` for things that live in `backend/`); `tests/layout.test.ts` pins it. |

Verification: `npm run build` clean; backend 1083 passed / 13 skipped; frontend 69 passed; eslint clean.
