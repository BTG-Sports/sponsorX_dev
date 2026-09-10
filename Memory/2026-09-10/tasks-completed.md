# Tasks Completed — 2026-09-10

## Task 1 — Learn the Documentation set
- Read/extracted all `.docx` under `Documentation/` (Master blueprints, "My View", Prelaunch ops binder, campaign series, Schools plans) and reviewed both Design mockup PNGs.
- Reported findings: what SponsorX is, the 4-phase roadmap, the 12 screens, the design system, business mechanics, and the pilot/schools angles.

## Task 2 — Discussion of findings (no planning/coding)
- User asked to discuss only. Shared deeper analysis: strengths, tensions (BTG-media vs athlete-network positioning), gaps/risks (manual metrics, minors/compliance, QR PII, Zoho drift), and the "operating loop is the product" insight.

## Task 3 — Confirmed build scope & tech stack
- Scope: marketing landing page + full Phase 1 app (3 dashboards) + real backend & database; mockups as reference only.
- Stack: **Next.js / Node.js + Express.js / PostgreSQL / Prisma / Redis / MinIO** (user-specified).

## Task 4 — Systems Architecture document
- Created `Documentation/Architecture/BTG_SponsorX_Systems_Architecture.docx` (20 sections, 38 tables) covering landing page + Phase 1 + dashboards, with the confirmed stack locked in throughout.
- Generator: `build_arch.py` (scratchpad).

## Task 5 — Explained business mechanics + "what kind of app is this"
- Plain-English breakdown of NIL jobs, packages, tiers, Content Value Score, CPM formula, QR funnel, Zoho split.
- Clarified it's a real B2B platform, not a game / not collectible cards (Maria + Tony's Pizza walkthrough).

## Task 6 — Plain-English Team Overview document
- Created `Documentation/Overview/BTG_SponsorX_System_Overview_Plain_English.docx` (12 sections, 29 tables) so the whole team understands the system.
- Generator: `build_overview.py` (scratchpad).

## Task 7 — Set up memory + backup system
- Added standing rule to Claude persistent memory: after every task, back up to repo `Memory/<YYYY-MM-DD>/`.
- Created persistent memories: project overview, tech stack, working mode, backup workflow, MEMORY.md index.
- Created in-repo `Memory/Initial Memory/` baseline snapshot (files 00–05) and this dated task log.

## Task 8 — Adopt "always use graphify" rule + memory sync
- Added an **"Always use graphify"** section to project `CLAUDE.md`: treat any
  codebase/architecture/content question as a graphify query first (repo now
  carries `graphify-out/`), falling back to direct file tools only when graphify
  can't answer.
- Added a **"Sync with the team via `memory/`"** section to `CLAUDE.md`: read
  `memory/` at session start; log completed work to the dated subfolder.
- Recorded the same graphify rule in baseline `Initial Memory/03-rules-and-workflow.md`;
  fixed the stale "not a git repo" note (it is now a git repo, branch `main`).
- Flagged a stack discrepancy in `04-key-decisions-and-findings.md`: baseline (02)
  says Express/Prisma/Redis/MinIO, but current `CLAUDE.md` + `.claude/stack-decision.md`
  moved to Next.js route handlers / Railway / R2 / Postgres queue / Clerk. Left
  `02` uncorrected pending team reconciliation.

## Task 9 — Phase 1 Build Roadmap (Block A + Block B)
- **Discovered the baseline is stale:** application code now exists. A front-end
  prototype (Next 16.3.4 / React 19 / Tailwind 4) is built for all 12 screens +
  3 portals + public site + fan-redeem, running on `src/lib/fixtures.ts` (shaped
  to the V2 Prisma models) and `src/lib/mock-auth.ts`. **10 routes are still
  `ScreenStub` skeletons.** Backend is greenfield — no prisma/, no Clerk/Zod/
  pg-boss/@aws-sdk, no `src/server`, `src/contracts`, `worker/`, `api/v1`, tests.
- **User decisions this session:** deliverable = phased roadmap doc; organize
  along the §39 loop; resolve pre-code gates in a dedicated step; **do the
  backend AFTER finishing the whole UI scaffold**; retheme the app to the BTG
  SponsorX logo (added as step A0); portal accents **follow the logo**
  (Athlete=blue #2E9BF5, Sponsor=orange #F97A1F, Admin=steel #CBD5E1,
  Property=soft-blue #63B4F8); A0 documented, not yet implemented.
- **Wrote `documentation/SponsorX-Phase1-Build-Roadmap.md`** — two blocks:
  - **Block A (UI scaffold, fixtures only):** A0 brand retheme (token swap in
    `globals.css`: bg #0A0C10, primary blue #2E9BF5, accent orange #F97A1F,
    warn #FACC15), A1 build the 10 stub routes, A2 state/polish + light theme,
    A3 fixture completeness, A-gates (resolve 5 gates + counsel templates in
    parallel — they block Block B, not Block A).
  - **Block B (backend spine, swap mock→real along §39 loop):** B0 foundations,
    B1 onboarding, B2 catalogue, B3 brief→invite, B4 Campaign Order, B5
    deliverables, B6 funnels, B7 metrics/earnings/report, B8 Zoho + hardening +
    UAT. Each follows §12 order and ends by wiring the finished UI.
- Roadmap sequences only; the *how* still lives in `SponsorX-Implementation-Guide-V2.md`.

## Task 10 — Executed Roadmap Block A0: brand retheme (mockup-v1.0 purple/teal → BTG SponsorX logo blue/orange)
- **Token swap in [`src/app/globals.css`](../../src/app/globals.css)** (the cascade — one file rethemes all ~25 routes via semantic tokens):
  - ground `#0E1016`→`#0A0C10`; surfaces/lines retuned to the darker ground.
  - `--sx-primary` `#6D34FF`→`#2E9BF5` (blue); `--sx-primary-soft` `#8A5CFF`→`#63B4F8`.
  - `--sx-accent` `#00E08B`→`#F97A1F` (orange); added `--sx-accent-soft` `#FB923C`.
  - `--sx-warn` `#F5A524`→`#FACC15` (yellow, separated from brand orange); `--sx-danger` kept `#FF4D4F`.
  - Rewrote the source-of-truth comment block (was still citing "Mockups v1.0").
- **Portal accents now follow the logo** (both `globals.css` tokens + the `ACCENT` map in
  [`portal-shell.tsx`](../../src/components/portal-shell.tsx)): Athlete `#2E9BF5` blue, Sponsor
  `#F97A1F` orange, Admin `#CBD5E1` steel, Property `#63B4F8` soft-blue (`--sx-property` new).
  Mapped `--color-accent-soft` + `--color-property` in `@theme inline` so Tailwind emits
  `text-accent-soft`, `bg-property/15`, `text-athlete/sponsor/admin/property`.
- **Logo:** the mark is a stacked "BTG / SPONSOR**X**" wordmark (blue BTG, orange X), not a raster
  asset — **no official brand image file exists in the repo** (design PNGs are the v1.0 mockups).
  Built a shared [`Logo`](../../src/components/logo.tsx) component (size inherited from parent
  font-size; `stacked` prop) + a standalone [`public/sponsorx-logo.svg`](../../public/sponsorx-logo.svg)
  for favicon/share use. Wired Logo into login form, portal sidebar, site header + footer, and
  the marketing hero (larger lockup above the eyebrow). X is now always orange everywhere (was
  portal-tinted in the sidebar); portal identity still shown by the dot + label chip.
- **Killed hardcoded purple/teal:** 3 decorative hero gradient washes (login, sponsor
  marketplace `[jobId]`, property `[slug]`) hardcoded purple on the old ground → rethemed to
  brand-blue washes ending at `#0A0C10`. Charts already use `var(--sx-*)` tokens, so they
  followed the cascade automatically (dual series = orange accent + blue primary-soft).
- **Verified:** `tsc --noEmit` clean; `next build` green (all 25 routes); `eslint` only the 3
  pre-existing unused-var warnings in files A0 didn't touch. Grep confirms no purple/teal hex
  remains except the intentional "supersedes v1.0" note in the globals.css comment.
- **A0 exit criteria met.** Next up per roadmap: **A1** — build the 10 remaining `ScreenStub`
  routes on fixtures.

## Task 11 — Wired the real BTG SponsorX logo assets (replaces the A0 text-wordmark stand-in)
- User supplied official art in [`raw-assets/logo/`](../../raw-assets/logo/): `SponsorX_BTG_logo.png`
  (circular metallic BTG badge, blue/orange ring + star — square), `SponsorX_Title_logo.png`
  (transparent "BTG SPONSOR X · Athlete Network. Brand Impact." wordmark), `SponsorX_full_logo.png`
  (full lockup on dark bg). Copied all three into `public/` as `sponsorx-badge.png`,
  `sponsorx-title.png`, `sponsorx-full.png`.
- **Browser-tab favicon:** copied the badge to [`src/app/icon.png`](../../src/app/icon.png) — Next.js
  file convention auto-emits the favicon `<link>` (build shows the `/icon.png` metadata route).
  **Also deleted the default `src/app/favicon.ico`** (the Next.js logo) — it was winning the
  `/favicon.ico` request and overriding icon.png. (Favicons cache hard; needs a hard-refresh to show.)
- **Rewrote [`Logo`](../../src/components/logo.tsx)** from the text placeholder to a plain `<img>` of
  the transparent title wordmark (`/sponsorx-title.png`), sized by height via `className` (e.g. `h-7`).
  Plain `<img>` (not next/image) to stay host-portable per CLAUDE.md; scoped `eslint-disable` for
  `@next/next/no-img-element` so lint stays clean. Call sites updated to heights: site header/footer
  `h-7`, portal sidebar `h-7`, login `h-10`, hero `h-14`.
- **Login image panel:** replaced the plain "BTG" text watermark with the circular badge
  (`/sponsorx-badge.png`, blue drop-shadow glow).
- Deleted the now-obsolete `public/sponsorx-logo.svg` (my earlier SVG stand-in).
- **Verified:** `tsc` clean · `next build` green (all 25 routes + favicon) · lint unchanged (only the
  3 pre-existing unused-var warnings; the img warnings are suppressed by the scoped disable).

## Task 11 — Roadmap A1: built the 10 remaining stub routes (fixtures only)
- **Decision:** forms follow the **existing no-client-JS server-component pattern** (decorative
  read-only fields, disabled buttons with `title` tooltips, `BlockedNotice` for anything un-wired) —
  **not** react-hook-form + Zod as A1's literal text suggested. Reason: those deps aren't installed
  (that's B0), and every one of the ~15 built routes is a no-JS server component. User confirmed.
- **Extended [`src/lib/fixtures.ts`](../../src/lib/fixtures.ts)** (append-only, existing consumers
  untouched): added ACCEPTED/DECLINED/EXPIRED `invitations` + `INVITE_COPY`; `applicationSections`
  (§11 ten-section onboarding); `orderTerms` (Campaign Order clauses/payment); `applications` +
  `APPLICATION_COPY` (admin queue with AthleteScore factor snapshot, `method: "rules-v1"`, §14);
  `contentReviewQueue` (derived from `deliverables`); `earningItems` + `EARNING_COPY`;
  `sponsorInvoices` + `INVOICE_COPY` (Zoho Books, inbound only); `integrationHealth` + `HEALTH_COPY`
  and `adminActivity` (§23). All shapes still mirror the V2 Prisma models.
- **Added two back-targets** to [`src/lib/back.ts`](../../src/lib/back.ts): `athlete-invitations`,
  `applications`.
- **Built all 10 routes** to the quality bar of the existing screens (blueprint-cited comment
  blocks, shared `@/components/ui` primitives, `?from=` back-links, field-level authz honored):
  - **Batch 1:** [`(public)/join`](<../../src/app/(public)/join/page.tsx>) (§11 front door, guardian
    branch, agreement blocked §08) · [`athlete/invitations`](<../../src/app/(app)/athlete/invitations/page.tsx>)
    (all states + filter) · [`athlete/orders/[id]`](<../../src/app/(app)/athlete/orders/[id]/page.tsx>)
    (Campaign Order, accept blocked, minor/guardian branch) ·
    [`athlete/earnings`](<../../src/app/(app)/athlete/earnings/page.tsx>) (status-only, no tax ID/bank).
  - **Batch 2:** [`admin`](<../../src/app/(app)/admin/page.tsx>) (§23 command center: queues +
    integration health + activity) · [`admin/applications`](<../../src/app/(app)/admin/applications/page.tsx>)
    (review + score snapshot Meters) · [`admin/approvals`](<../../src/app/(app)/admin/approvals/page.tsx>)
    (§21 content pipeline) · [`admin/finance`](<../../src/app/(app)/admin/finance/page.tsx>)
    (earnings states + Zoho invoice refs; payout **blocked on §37 payment-policy A-gate**).
  - **Batch 3:** [`(public)/packages`](<../../src/app/(public)/packages/page.tsx>) (§7 six packages +
    decorative filters + request-a-brief) · [`property`](<../../src/app/(app)/property/page.tsx>)
    portal — also **created its missing layout** [`property/layout.tsx`](<../../src/app/(app)/property/layout.tsx>)
    (PortalShell, property accent, §09 own-property scoping note).
- **Verified:** `next build` green (all 21 app routes) · `tsc --noEmit` clean · `eslint` clean on all
  A1 files (0 warnings) · **no `<ScreenStub>` remains in `src/app`** — A1 exit condition met.
- **Not done (out of A1 scope):** graphify ingestion not re-run (no graph exists yet — used direct
  file tools); loading/empty/error states + light theme are A2; edge-state fixture completeness is A3.

## State at end of day
- **A1 shipped** (see Task 11) — all portals fully navigable on fixtures; no stub routes remain.
- **A0 shipped** (see Task 10) — app now renders on-brand (blue/orange on near-black) in dark
  theme across all routes; logo present in login, portal headers and marketing hero.
- Baseline `Initial Memory/` note "greenfield, no code" is now **superseded** —
  the front-end prototype exists (see Task 9). Update the baseline when convenient.
- Deliverable docs now: Architecture + Overview + **Phase 1 Build Roadmap**.
- Standing rules unchanged: always-graphify + read `memory/` each session +
  back up after each task.
- **Light-theme variant of the A0 palette is deferred to A2** (per roadmap); dark stays default.
