# 2026-10-07

- **The SponsorX repository moved to the BTG-Sports organization** (GitHub Team plan, owner `rcarr-crypto`; `infinex1` is also an owner). It is now `github.com/BTG-Sports/sponsorX_dev`, and the old `infinex1/sponsorX_dev` links redirect.
  - Issues, pull requests, Actions secrets and variables, and collaborators moved with it. CI runs on the new repository.
  - **Railway:** the Railway GitHub app is installed on BTG-Sports (only this repository). All four services (staging and production, api and web) now point at `BTG-Sports/sponsorX_dev` on the `release` branch. Railway's API refuses repository changes from the CLI (NotAuthorized), so they were made in the dashboard by the owner.
  - **Deploys:** staging was redeployed from `main` (acbb23a). Production rebuilt the same commit (499e0b5).
  - This Mac's `origin` and `documentation/SponsorX-Developer-Handoff.md` now use the new address.
  - **Still to update by hand:** the Vercel test deployment's GitHub connection (HeckerCreatives).
- **The "SponsorX received this from the payment provider" emails** were noise from the 2026-10-06 Stripe sandbox tests. Sandbox events for test accounts and payments created from this Mac reached staging, failed after 7 tries and emailed BTG admins: 59 events.
  - The fix that ignores foreign accounts (7105256) is now on staging (PRs #160 → #166, deployed).
  - The 59 FAILED rows are still on staging's exceptions list; clearing them is offered, not yet done.
- **Slack tracker broadcast (owner's decision):**
  - each merge to `main` that changes tasks now posts one Slack message listing them (`tracker-notify.yml`; `--no-slack` removed);
  - the 8 pm digest posts only on days with none (`tracker_sync.py digest --skip-if-announced`);
  - the Stage Progress row is still appended every day.
  - Tests: 23/23 (`DigestOnlyOnQuietDays`).
- **PR #167** (the release of 2S8-PMO-02 to `main`) is open. #165 merged into main_development just after #166 went to `main`.
- **Code review rows checked against acceptance.**
  - **Done:** 2S8-PMO-02, plus 2S3-FE-02, 2S5-FE-03 and 2S5-FE-04 after browser verification on the local stack. The team page equals the ledger: $151.05 booked, $135.64 paid, $15.41 reserve.
  - **Still in review:**
    - 2S5-FE-05: no receipt has been delivered on staging, because Resend rejects `@example.com`. Also, the receipt goes to the signed-in user, not the billing contact the checkout copy names.
    - 2S7-FE-02: the console lacks disputes, payment events, REQUESTED payouts, refunds to send and delivery issues.
- **2S0-OPS-01 · Done.** The owner agreed RPO ≤ 1 h and RTO ≤ 4 h. PITR on both environments already meets them: `archive_timeout` = 60 s, so a segment is archived every minute.
- **2S8-OPS-01 · In progress.**
  - A staging PITR restore into `pg-restore-check-1007` matched live exactly and was queryable in about 9.5 minutes. The service was then deleted.
  - Rollback took 41 s and roll-forward 51 s. Rollback is code-only across migrations.
  - **Alerting is built:**
    - `GET /health/full`, with db, redis, storage and backups (stale after 60 minutes);
    - the web path `/api/v1/public/health`;
    - `.github/workflows/health-monitor.yml`, every 15 minutes, with per-environment state, posting to Slack only on change.
  - **Done after deploy and a test alert:** `gh workflow run health-monitor.yml -f simulate_failure=true`.
- **2S8-PMO-01 · In progress.** The sign-off record is `documentation/SponsorX-Phase2-Acceptance-Signoff.md`: 12/14 demonstrated, #13 Zoho partly, #11 wallet not built. It still needs real external users on staging, through its 18-step plan, and the owner's sign-off.
- **The wallet rows' notes are corrected.** They wait on Apple and Google wallet accounts, not on the payment provider.
- **2S1-OPS-01 is waiting on the owner** to name the inbox `support@sponsorx.net` should forward to. Today `sponsorx.net`, on Cloudflare, has no MX records. Zoho Desk exists (department "iCARRe Foundation") but has no email channel.
- **Local note:** the scratchpad was wiped. The verification agent left a throwaway embedded Postgres running on 55432 (`scratchpad/pg`), and its worktree is still locked.
- **2S8-OPS-01 · Done.** Release #170 (`aae0ca2`) is deployed to staging (by the lead) and production (by the owner). `/api/v1/public/health` returns ok in both, with backups archived less than a minute ago. A `[TEST]` alert was delivered to Slack (health-monitor run 37584104464). The monitor now runs every 15 minutes.
- **2S8-PMO-02's settings are live in production too:** HSTS `includeSubDomains` and the report-only CSP.
- **2S1-OPS-01 and 2S1-BE-16 · Done.**
  - Cloudflare Email Routing is enabled on `sponsorx.net` (account Rcarr@icarrefound.org), with MX `route1`–`route3.mx.cloudflare.net`, the SPF record and the `cf2024-1` DKIM key.
  - `support@sponsorx.net` forwards to `infinex1@icarrefound.org`. The owner chose this as a stopgap; Zoho Desk comes later.
  - `SUPPORT_MAILBOX_READY=true` is set on the staging and production `api`.
  - **Staging test:** two contact-form messages went out, one with a PNG that is stored privately and sent as a link. 4/4 emails were sent and none failed, and the owner confirmed delivery.


## HeckerCreatives — P1-ART-18: the whole admin portal on the stage (Code review)

The owner asked for the whole admin portal in the Mission Control language, components included, without check-ins. Spec: `docs/superpowers/specs/2026-10-07-admin-portal-stage-design.md`. Branch `feature/P1-ART-18-admin-portal-stage`, stacked on P1-ART-17.

- **The stage is now the admin shell's.** `PortalShell` takes `stage`; the admin layout sets it. The root carries `.sx-ops`, `<main>` is an `OpsStage` with `OpsGround` (no word), the house padding and 1440px column, no overflow clip (the matching studio's sticky bars need it). The theme toggle is hidden there.
  - `StagePortals` adds `.sx-ops` to `<body>` while mounted, so drawers, dialogs and menus portaled to the body are on the stage even for Frost users.
  - The four desks from P1-ART-14…17 drop their own stage wrappers. `/admin`'s hero is now a dashboard header (`OpsHeader`: title + tiles, with a compact ring tile by queue).
- **A shared skin** in `globals.css` under `.sx-ops`, keyed on marker classes added to the primitives (`sx-card`, `sx-badge`, `sx-section-title`, `sx-hero-band`, `sx-stat`, `sx-btn-*`, `sx-tabs`, `sx-notice`, `sx-page-title`). It also matches `role=tablist/tab`, the `rounded-lg border border-line bg-surface p-1` link-strip idiom, native `select` / `input` / `textarea`, `button.bg-primary` / `button.border-line`, `.sx-drawer`, and `[role=dialog] > div > .sx-pop`.
  - 52 identical `<h1 className="text-xl font-semibold tracking-tight">` swept to `sx-page-title` across 38 files.
  - Cards get bracket corners from pseudo-elements, not clip-path, so a dropdown inside a Card isn't cut off.
  - 24 files still use native `<select>`; they're skinned, not replaced.
- **Environment, two findings:**
  1. **Docker Desktop was off.** Started it, `npm run docker:up`, then the API.
  2. **The PC clock is ~10 minutes behind Clerk's.** Every session token was "not active yet" (API 401; Next's Clerk middleware handshake-looped /login → /portal). `w32tm /resync` needs admin. Added an optional `CLERK_CLOCK_SKEW_MS` to the API (`backend/src/config/env.ts`, `auth/clerk.ts`) and to `frontend/src/proxy.ts`; both servers were started with it for the walk only. The owner should sync the clock. Saved as Claude memory "clock-skew-breaks-clerk".
- **Verified:**
  - Frontend 1167 tests, eslint, tsc (frontend and backend).
  - Playwright sampler as BTG_ADMIN: 27 desks on the stage, `body.sx-ops` true on each, no console errors, overflow 0; the applications drawer and the rules dialog dark; light theme identical; 390px on three pages.
  - `next build` in a detached worktree: green, all 45 `/admin` routes.
- **Tracker:** P1-ART-18 is Phase 1 row 294 (Order 32.996, Code review); ranges extended to 294; a 2026-10-07 snapshot row added.

## HeckerCreatives — P1-FE-31: the admin desks' lists as server-paged tables (Code review)

The owner asked whether the admin desks' tables page "based on our rules and memory", then: "convert them to tables with pagination … IF only its needed to be converted to be a table to make it optimized and make it easy on the eyes of the user". Spec: `docs/superpowers/specs/2026-10-07-admin-lists-paged-tables-design.md`. Branch `feature/P1-FE-31-admin-lists-paged`, stacked on P1-ART-18.

- **The audit.** Already server-paged: board, applications, approvals, campaigns, matching studio, finance reconciliation, marketplace, network, new sign-ups (+ sensitive edits), rewards, NEXT prospects; the rules panel pages its places in the browser by the owner's choice. **Not paged — ten desks** reading a whole list (or the API's silent cap of 100–500) and some counting tabs from the rows in view: audit log, briefs, sponsor requests, property verification (eight whole-table reads to count its tabs), payouts, refunds, delivery issues, guardian handoffs, closed accounts, offers.
- **Nine become one shared stage table** — `frontend/src/components/stage-table.tsx` (`StageTable`, `Tr`, `Td`, `Primary`, `PagedTable`, `TabStrip`/`TabLink`) and `.sx-table` in `globals.css`: a real `<table>`, the house pager above and below, rows rising in on the stage, stacked into cards with `data-label` headers below `md`. **Briefs stays rows** (reasons, checklist, detail panel) but is paged, with tab / search / sport on the server.
- **The API** gains the house pager (`lib/paging.ts`) on `/sponsor-requests`, `/onboarding` (`reviewQueuePage`, every tab's count), `/payouts`, `/refunds`, `/delivery-issues` (`deliveryIssuesPage`: one tab, counts for all three — `problems`/`settled` page the issues themselves), `/guardian-handoffs`, `/account-closures`, `/offers` (`listOffersPage`: the desk's tab rules moved to WHEREs, `counts` + `tabs`), `/audit-log` (a counted page beside the cursor) and `/briefs` (`?sport=`, `counts`, `facets.sports`). Every new read carries its `tenant-scope:` note.
  - Found in review (subagent): the audit route's first cut clamped the page before counting, so `?page=2` answered page 1. Fixed: count, clamp, then read.
- **Verified:** backend tsc + static scope tests + nine endpoint tests (`?page=1&size=1`: one row, the page, counts equal to the unpaged call, no `page` key without `?page`); frontend tsc, eslint, 1167 unit tests; Playwright `e2e/admin-lists-paged.spec.ts` as BTG_ADMIN — ten desks on the stage, table/rows with the pager or an empty state, no console errors, no overflow, `?size=24` honoured, a tab link resets `?page`; `next build` in a detached worktree.
- **Tracker:** P1-FE-31 is Phase 1 row 295 (Order 32.997, Code review); ranges extended to 295; the 2026-10-07 snapshot row recomputed.
- **Note for the dev API:** `combined.mts` doesn't watch — it was restarted for the walk. Both servers still run with `CLERK_CLOCK_SKEW_MS=1200000` until the owner syncs the clock.

## HeckerCreatives — P1-ART-19: the commission desk (Code review)

The owner: "/admin/commission page visual design looks shit, too much space, redesign or restructure the page itself to make it easier for the eyes of the user". Spec: `docs/superpowers/specs/2026-10-07-commission-desk-design.md`. Branch `feature/P1-ART-19-commission-desk`, stacked on P1-FE-31.

- **Before:** six tall cards (one per rule kind, most "No rule"), a whole add-rule form always open, the sample order under it — a screen and a half at 1440, four screens on a phone.
- **Now:** the **split strip** (six tiles in the ledger's order, each headlining the rate for everyone — `kindSummary` in `lib/commission-live.ts`, unit-tested), the **picked kind's rules as a stage table** (earlier versions unfold under a row), the **sample order beside it** (sticky; the split as a waterfall), and **add / revise in a dialog** (`commission-rule-dialog.tsx`, the P1-ART-17 shape; `ComboBox` now exported from `place-dialog.tsx` with `showCode`) that previews the unsaved rule against the sample order.
- Visuals and structure only — the API contract and actions are unchanged.
- **Verified:** tsc, eslint, 10 unit tests in `commission-live.test.ts` (render test rewritten for the desk, three `kindSummary` cases added); Playwright pass as BTG_ADMIN at 1440 and 390 (strip, split, dialog with preview and dropdown, Escape closes, no console error, no overflow).
- **Tracker:** P1-ART-19 is Phase 1 row 296 (Order 32.998, Code review); ranges extended to 296; the 2026-10-07 snapshot row recomputed.

## HeckerCreatives — P1-ART-20: the marketplace desk (Code review)

The owner: "same in /admin/marketplace, the structure looks shit". Spec: `docs/superpowers/specs/2026-10-07-marketplace-desk-design.md`. Branch `feature/P1-ART-20-marketplace-desk`, stacked on P1-ART-19.

- **Before:** six stat tiles, then six stacked full-width cards (applications, listings, orders, failed payments, payout problems, disputes), each mostly a hint and "nothing here" — the same number twice, two screens.
- **Now:** the **queue strip** — five tiles, one per queue, each with its count, one line of context and a tone for work waiting; a tile is the navigation (`?queue=`, written in place), the desk opens on the first queue with work — and **one panel** under it: a stage table for applications, orders, failed payments and payout problems, or the listing desks' inline-action rows under their three tabs (`components/marketplace-desk.tsx`). Disputes are one line. The listing emails' `?listings=…#listing-…` links still land on the right row.
- Reads unchanged in substance (one parallel pass; switching reads nothing); `/onboarding` and `/payouts` now read with the house pager so the tiles' counts are the API's.
- **Verified:** tsc, eslint, 25 unit tests across the two marketplace test files (two `queueKey` / `firstBusyQueue` cases added); Playwright `e2e/admin-marketplace-desk.spec.ts` as BTG_ADMIN at 1440 and 390.
- **Tracker:** P1-ART-20 is Phase 1 row 297 (Order 32.999, Code review); ranges extended to 297; the 2026-10-07 snapshot row recomputed.

## HeckerCreatives — P1-ART-21: the admin sidebar in collapsible groups, sorted (Code review)

The owner: "restructure the navigation buttons in the side, its too many, if its possible to have a collapsable please do so" and "sort them orderly". Spec: `docs/superpowers/specs/2026-10-07-admin-sidebar-groups-design.md`. Branch `feature/P1-ART-21-admin-sidebar-groups`, stacked on P1-ART-20.

- **Before:** 29 links in one flat column, in build order.
- **Now:** Dashboard on top, then seven collapsible groups in the order BTG works — Intake, Campaigns, Marketplace, Money, Accounts, NEXT, System — each A → Z inside. The group holding the open page opens on arrival; the viewer's other choices are remembered per browser (`localStorage` read through `useSyncExternalStore`, so no hydration mismatch and no state set in an effect — the lint rule `react-hooks/set-state-in-effect` refused the first cut). The phone drawer lists the groups with their desks two to a row.
- `NavItem.group` + `lib/nav-groups.ts` (pure); a nav without groups renders flat, so the other portals are untouched. The per-role filter and the commission-only rule are as before (the commission test's regex on the layout still holds).
- **Verified:** tsc, eslint, `tests/nav-groups.test.ts` (3; one pins the admin groups' order and sorting from the layout source), Playwright `e2e/admin-sidebar-groups.spec.ts` as BTG_ADMIN.
- **Tracker:** P1-ART-21 is Phase 1 row 298 (Order 32.9995, Code review); ranges extended to 298; the 2026-10-07 snapshot row recomputed.
- **Follow-up (owner: "showing takes to long when you collapse"):** a group's desks were staggered from the top of the whole nav (`80 + i × 40 ms` over a 0.5 s fade), so the last group took over a second to appear. Now a group's desks are timed from their own first row — 25 ms apart, a quarter-second fade — and only the top items and the group headers stagger down the column on arrival.
- **Follow-up (owner: "redesign the visual, too plain"):** group headers now read like desk rows — a glyph tile per group (`groupIcon` on one item; `NavGroup.icon`), the name, a count chip, a caret; the group you are in gets the accent rail, wash and a glowing tile; an open group brightens and its desks hang off a cyan track line; hover sweeps a light. The group name is 10px / 0.12em so "Marketplace" fits the 224px rail.
- **Follow-up (owner: an x scrollbar on the nav when hovering):** the header's hover sweep slides a full-width light past the header's right edge, and the sidebar's scroller only said `overflow-y-auto` — which gives `overflow-x: auto` with it — so the moment of overflow drew a horizontal scrollbar. The header now clips (`overflow-hidden`) and the scroller is `overflow-x-hidden`; the walk hovers a header and pins zero horizontal overflow.

## HeckerCreatives — merge of `main_development` (rcfworks' Sprint 8 close-out) into the admin-portal stack

Nine conflicts, all kept both sides: `auth/clerk.ts`, `config/env.ts` and `frontend/src/proxy.ts` (rcfworks' Clerk `authorizedParties` plus my optional `CLERK_CLOCK_SKEW_MS`); `domain/delivery.ts` and `domain/payouts.ts` (both imports); `contracts/registry.ts` (both imports; `/payouts` summary carries rcfworks' 2S5-BE-05 sentence and my paging sentence); the two Memory logs (theirs then mine). **The tracker was merged three ways by cell** (scratchpad `xlmerge/merge_board.py`): rcfworks' workbook as the base, my nine Phase 1 rows (P1-ART-14…21, P1-FE-31) appended at 290–298 with ranges extended, no cell changed on both sides, and the 2026-10-07 snapshot recomputed (their 2026-10-05 row kept as theirs). Two tests adjusted to the merge: `security-review.test.ts`'s proxy regex now allows the skew option after the parties list; `commission-live.test.ts` mocks the rules desk's server actions, which the rule dialog's ComboBox reaches and which now import `server-only`. After the merge: `npm install` (stripe), `prisma generate` and `migrate deploy` were needed before the backend typechecked (memory: backend-errors-after-pull). `origin` now points at `BTG-Sports/sponsorX_dev` (the repository moved on 2026-10-07).
- **After the merge, the full backend suite on a clean `sponsorx_test` (`npm run db:test`):** two of mine fixed — `listOffersPage` named in `financial-audit-coverage`'s READ_ONLY list (a read), and the briefs sports facet made opt-in (`?facets=sports`, the desk asks for it) because `desk-lists.paged` counts the brief reads across a page break. The rest were environmental or Windows-only: suites that ran against the shared dev DB while the walks and the dev API were mutating it (tenant-isolation, pilot-school, next-students — all green on the test DB), and three static tests that compare Windows `\` paths and CRLF line endings against `/` and `\n` (`payments-pii` ×2, `security-hardening` ×1, plus `sql-rules-in-migrations`'s `spawnSync npx ENOENT`) — pre-existing on this machine, green on CI.

## HeckerCreatives — Phase 2: the nine remaining frontend screens (Code review)

The owner: "let's go to phase 2 … let's do all of this in one go". Spec: `docs/superpowers/specs/2026-10-07-phase2-frontend-screens-design.md`. Branch `feature/P2-FE-screens`, cut from `main_development` after the merge. Built as three parallel streams on disjoint files, integrated and re-verified together.

- **2S5-FE-07 Payment events** — `/admin/payments/events`: tiles (Needs BTG, Held, Failed, Deferred), tabs Needs BTG / Deferred / Resolved / All, a stage table, **Resolve…** dialog with a required note (Finance reads, no button). `GET /payment-events` gained the house pager and `?resolved=true|false` (`domain/payment-events.ts`, tenant-scope notes, registry).
- **2S5-FE-08 Disputes** — `/admin/payments/disputes` (tiles by state, tabs, table) and `/[id]` (facts grid, the order's lines, the payouts it freezes; **Take for review** and **Resolve as the provider's outcome** dialogs, line checkboxes on a partial loss; Finance reads only). `GET /disputes` gained the pager (`openedAt` desc inside a state).
- **2S5-FE-12** — `PROVIDER_REFUNDED` on Finance's refund list: "Provider refund", "Refunded by the payment provider · ref", no Mark refunded.
- **2S1-FE-14** — `/admin/support/[id]`: sender, topic, text, attachments as a table with **Open** (a server action fetches the five-minute signed link, opened in a new tab). BTG admin only; no nav entry (the email links here).
- **2S5-FE-09** — frozen money: a "Frozen" badge and "BTG is reviewing a problem with the sponsor's payment" on the athlete's per-order row (its amount shown as frozen, not available); a notice above the property's request panel; the `dispute` check renders through the checks list. Frozen amount = `balanceCents` (what the freeze removes from the requestable total).
- **2S5-FE-10** — payouts' `sendAttempts` / `returnedAt` / `returnCount` (integers): "Handed to the provider N time(s)" and a danger line "Returned by the bank on <date>" on BTG's payout detail and in its audit trail; the payee's history reads "Returned by your bank: fix your payout account" with the fix link.
- **2S5-FE-11** — a 503 `busy` from `POST /marketplace-orders/:id/pay` becomes "The payment service is busy. Try again in a minute." (`payRefusal` in `lib/order-payment-live.ts`); the button stays enabled; `refusalFrom` untouched.
- **2S8-FE-01** — `components/link-expired.tsx` + `lib/link-expired.ts` + `renewLinkAction` → `POST /public/links/renew`; the nine emailed-link pages render it on a 410 with the body's `kind` (fallbacks per page); `/join` through the checklist's server action.
- **2S8-FE-02** — "Check your email" after a claim; new `/athletes/claim/confirm?t=` with one **Confirm my email** button (POST through a server action; a mail scanner's GET confirms nothing); `?claim=` banners on `/athletes/[slug]`; the backend's `claimConfirmUrl` now points the email at the page (`domain/featured.ts`, test updated).
- Also fixed on the way: the athlete money page overflowed at 390 from the staging-provider badge (`payout-account-panel.tsx`), now wrapping.
- **Nav / access:** Money group gains Disputes and Payment events (A → Z kept); `lib/admin-access.ts` maps `/admin/payments/*` (BTG admin, Finance) and `/admin/support` (BTG admin).
- **Verified:** backend tsc + 238 tests across the static, registry, payments, links and authz files; frontend tsc, eslint, 1238 unit tests; eight Playwright walks against the restarted dev servers (`localhost`, one at a time). The dev DB holds no payment events, disputes or payouts, so those desks were walked in their empty states; the actions are unit-tested and the owner's check-list says how to raise real ones with the stand-in provider.
- **Tracker:** the nine Phase 2 rows moved to Code review (HeckerCreatives, started 2026-10-07); the 2026-10-07 snapshot recomputed.

## HeckerCreatives — QA of the nine Phase 2 screens on real data

The owner: "QA test the things that we did in phase 2". Seeded a paid, delivered order with a paid payout by running the marketplace walk on existing e2e identities (the Clerk dev instance is at its 100-user cap, so `marketplace-path.spec.ts`'s new identities can't be created; a copy bound to `walk-*` keys ran instead, with a static import of `./support/object-store` — a dynamic `import()` of a .ts file is loaded untransformed by Node on Windows). Then drove every screen with stand-in provider events (`POST /payment-events/test-provider`) as the people who see them. Kept as `e2e/qa-phase2.spec.ts` (events, provider refund on a second paid order, a fresh dispute per run through review and a partial LOST resolve, the athlete's frozen money, Finance read-only, a bank-returned payout, a support message with a file and its Open link, the claim banners, an unpaid order left for the busy check), `e2e/qa-phase2-claim.spec.ts` (a FEATURED profile claimed → "Check your email" → the outbox email now links `/athletes/claim/confirm?t=` → GET confirms nothing → the button confirms → the banner; the claim is SUBMITTED) and `e2e/qa-phase2-busy.spec.ts` (API started with `STANDIN_OUTAGE=checkout`: the pay button says busy, stays usable, nothing recorded).

- **Found and fixed:** (1) a dialog opened from a row of a stage table was confined to the table's card and clipped — `backdrop-filter` on `.sx-card` makes it the containing block of a `position: fixed` box; the shared `OrderDialog` (`components/order-dialog.tsx`) now renders through a portal onto `<body>` (StagePortals keeps `.sx-ops` there), which also fixes the refunds, delivery-issues and every other table desk that opens it. (2) `/athlete/money` overflowed 176 px at 390: the payout account panel's button column was `shrink-0`, so the staging badge could never wrap; the column is now `min-w-0 max-w-full` and the badge wraps.
- **Learned about the stand-in:** the route only RECEIVES an event; the worker applies it a second later (a walk must wait for the status to leave RECEIVED, and a refund raised before the payment's own event is applied is DEFERRED); a partial provider refund is HELD, a whole one on an untouched paid order is APPLIED and becomes the PROVIDER_REFUNDED row; the provider opens one dispute per payment (a second is IGNORED); `PAYMENT_PROVIDER_TIMEOUT_MS` cannot make the in-process stand-in time out — `STANDIN_OUTAGE=checkout` is the switch.
- **Screens checked by eye:** the events desk and its resolve dialog, the disputes list and detail (open, under review, lost), the resolve dialog with the line checkboxes, Finance's provider refunds, the support message page, the athlete's money page with the frozen order and the dispute check, BTG's payout detail with the attempts and the bank return, the busy checkout, the claim confirm page and banner. All as designed; the pager on the events desk showed 37 events over 4 pages.
- **Tracker:** after the QA the owner moved the nine Phase 2 screens to **Done** (2026-10-07).
