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
