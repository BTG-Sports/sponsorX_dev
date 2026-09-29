# 2026-09-29 — Phase 1 frontend ↔ API close-out (HeckerCreatives)

Scope: the rest of `P2-FE-01`, taken over from rcfworks at the user's
instruction. The goal was that no signed-in user sees fixture data presented as
their own. Branch `development/P2-FE-01-live-reads`. Fixtures stay for `?demo=`
and for signed-out visitors.

## `P2-FE-01` — remaining fixture-only screens wired → Code review

Every page follows the existing pattern:
- a server reader returns `null` for anyone who isn't that role, which renders
  the demo;
- there is no catch, so an outage is an error page, never fixtures.

- **Sponsor Campaigns list and detail.**
  - `server/sponsor.ts` is the shared reader; the dashboard now uses it too.
  - The list reads `GET /campaigns`. Live cards show views as "—" (views
    belong to the ROI report), and the views sort is hidden when every row
    lacks views.
  - The detail reads `GET /campaigns/:id/ops`. That endpoint is already
    sponsor-safe: invites are gated and orders are scoped by `whereFor`.
  - Another sponsor's campaign id shows "Campaign not found", never a sample.
  - `CampaignRow` now allows `views`/`spend` to be null and accepts any §21
    campaign state.
- **Admin Operations Board** (`server/admin-board.ts`). No new endpoints:
  - booked / invoiced / collected and pacing come from `/campaigns`;
  - the four work queues come from each desk's own list;
  - `/operations/integration-health` and the latest `/audit-log` entries.
  - Each section handles a 403 on its own ("not in your role"), so FINANCE
    and SALES get a partial board instead of an error.
  - Capped lists show "N+".
  - Figures with no source are not drawn: quarter-on-quarter GMV, median
    brief → match time, the growth line.
- **Athlete home.**
  - `server/athlete-home.ts` makes the athlete's own reads:
    `/athletes/me`, `/invitations`, `/deliverables`, `/earnings` and
    `/athletes/:id/guardian-readiness`.
  - `lib/athlete-home-live.ts` is pure and tested:
    - a lapsed invite isn't "open";
    - only the athlete's own moves are queued;
    - a minor without a verified guardian gets no upload link;
    - disputed earnings aren't counted as earned.
- **Property portal.**
  - `server/property.ts` reads `/properties/mine` and `/team/roster`
    (own-property scope).
  - It shows the roster and inventory. Audience figures are not drawn, because
    nothing measures them per property.
- **NEW backend read `GET /public/properties/:slug`**
  (`domain/property.ts` `publicProperty`, route, registry row,
  `tests/property.public.test.ts` with 4 tests).
  - Returns public FEATURED/ACTIVE athletes with the same field list as
    `publicProfile`.
  - **Minors are counted (`minorsNotListed`), never named.** This is my call;
    see the flags below.
  - No price, inventory, contact or legal name.
  - The public page renders real slugs. The demo slugs (`btg-sports-talk`,
    `demo-property`) keep the sample, and any other slug shows not-found.
  - The page doesn't link roster names, because an ACTIVE athlete's public
    page is still a fixture (raised `P3-FE-06`).
- **The public `/brief` now actually submits.** Before today, "Send to BTG"
  only changed local state.
  - Server action `brief/actions.ts` → `POST /public/inquiries`, which writes
    an Inquiry row and a queued `zoho.pushLead` in one transaction.
  - The structured answers travel in `message`, labelled.
  - Edge headers are forwarded, so the rate limit applies to the visitor
    (P8-SEC-03).
  - A failure keeps the draft and says so. `?demo=submitted` never posts.
- **Athlete profile editor** (product decision, user, 2026-09-29: "seed from
  live, save socials only").
  - `components/live-profile-editor.tsx` shows every §11 section from
    `/athletes/me`.
  - Socials save through `PUT /athletes/:id/socials`. The API labels an
    athlete's own numbers SELF_REPORTED.
  - Every other section says "ask your BTG contact". Raised `P3-BE-15` for real
    post-approval edits.
- **Already done, left alone:**
  - The portal chrome greets the Clerk user in every layout (QA pass 5).
  - The NEXT student pages are live through `next/live.ts`.
  - `/sponsor/marketplace/[jobId]` is demo-only by design: it is reachable
    only from the demo "Media properties" tab, which is hidden for live
    sponsors (no Phase 1 model).

**Verified**
- Tests: backend vitest 1700/1700; frontend vitest 386/386, 17 of them new.
- Lint, `tsc` and `npm run build` are green.
- 8 signed-in Playwright walks are green against the dev stack, with 0 console
  errors and 0px overflow at 390:
  - the sponsor sees only their own campaigns, and the cross-sponsor id shows
    not-found;
  - admin board and FINANCE partial board;
  - athlete home;
  - property manager (`seed_prop_northside`);
  - public property with adult named and minor counted;
  - brief submission (Inquiry row plus 1 `OutboxJob`);
  - editor socials save (`SELF_REPORTED` in `AthleteSocial`).
- The walk spec was a throwaway in `e2e/` and has been deleted.

## Tracker

- `P2-FE-01` → **Code review**, owner HeckerCreatives, with the notes above.
- Raised **`P3-BE-15`** (Order 65.7): post-approval athlete profile edits.
- Raised **`P3-FE-06`** (Order 82.5): ACTIVE athlete public profile on real
  data.
- Autofilter, Status DV and the three CF ranges extended to row 257. The
  Dashboard and Stage Progress formulas already run to 400.
- Stage Progress snapshot row for 2026-09-29 appended. Done is unchanged at
  219, because the day's work went to Code review, not Done.

## Flags for the team

- **Public roster policy.** Should a school's public page name its minor
  athletes? I made it count them and not name them. Each minor's own
  `/athletes/[slug]` is still public, per the existing `publicProfile`.
  Someone should confirm this.
- **`tests/pilot-school.test.ts` deletes the dev seed.** Its cleanup removes
  `seed_prop_northside`, so running the backend suite against the dev DB drops
  the pilot school. Re-seed with `seedPilotSchool(client, "seed_tenant_btg")`
  from `worker/jobs/seed-environment.mts`. The test should restore it or use
  its own id.
- **Public `not-found` returns HTTP 200** under `(public)/loading.tsx`
  streaming. The not-found UI renders, but crawlers see 200. This is
  pre-existing and affects every public `notFound()`.
- The inquiry has no staff desk in SponsorX. It lives as a Zoho Lead (§18).
  That is fine for Phase 1, but a brief sent from `/brief` is not a
  `CampaignBrief`.

**Nothing committed yet.** Everything above is in the working tree.

## QA pass 7 → [qa-pass7.md](qa-pass7.md)

23 adversarial/edge checks on the P2-FE-01 tree: 21 pass, 2 real defects (F-1 NUL-byte slug → 500 on three public routes; F-2 brief failure copy promises a saved draft but step-4 answers are lost), plus 3 low and 3 info. Not fixed yet.

## QA pass 8 → [qa-pass8.md](qa-pass8.md)

Failure modes, 132-campaign volume, hostile data, cross-tenant, keyboard, 31-route regression smoke, and the production standalone build: all green on the stated checks. New findings: F-9 (medium: /campaigns 100-row cap shown as the whole truth, list + board money undercount), F-10 (medium: saveSocials throws on expired session / outage → error boundary), F-11..F-13 (low), F-14/F-15 (info). Not fixed yet.

## Fix pass for QA 7 + 8 → [qa-pass8.md](qa-pass8.md#fix-pass--passes-7-and-8-same-day)

Fixed F-1…F-6, F-9…F-13 and F-15. F-14 closed (environment). F-7 (public 404 status) and F-8 (analyst spend policy) remain for the team. New: paged `GET /campaigns` + `GET /campaigns/:id`, `server/campaigns.ts`, `lib/brief-inquiry.ts`, `tests/nul-input.test.ts`, `tests/campaigns-paging.test.ts`. Backend 1711/1711, frontend 391/391, build green, re-test walks green.

## QA pass 9 → [qa-pass9.md](qa-pass9.md)

Static review + official e2e + scale/a11y probes. Found and fixed: F-16 (HIGH: public school page named FEATURED minors with no recorded age; now only confirmed adults are named), F-17 (HIGH: raw NUL bytes made three source files binary to git), F-18 (athlete save erased BTG-verified socials), F-19 (row-id cursor truncated on delete and was a cross-tenant existence oracle; now keyset), F-20 (brief timeout copy invited duplicates), F-21..F-23 (low). axe contrast hits were mid-animation artifacts (0 when settled). Official e2e 15/7/0, backend 1720/1720, frontend 391/391, build green.

## Server-side pagination for every growing list → [pagination.md](pagination.md) (`P2-FE-02`, Code review)

37 list screens inventoried; every unbounded one is now offset-paged by the API with DB-side search/filter/sort and summary aggregates for its counts and money; bounded catalogues left client-side on purpose. Backend 1821/1821, frontend 454/454, build green, official e2e 15/7/0, 20-route signed-in walk green.

## Check pass — every page, every role → [check-pass.md](check-pass.md)

14 role identities + signed-out, 195 page visits, access matrix, axe on 47 pages. 0 crashes / 5xx / console errors / overflow; access matrix correct; no cross-tenant or cross-sponsor leak; axe 45/47 clean. Findings C-1..C-5 (2 medium, 3 low), not fixed yet.

## Check-pass fixes C-1..C-5 → [check-pass.md](check-pass.md#fix-pass--c-1-to-c-5-same-day)

Role-aware admin desks + nav (lib/admin-access.ts, "Not in your role"), guardian demo notices, campaign-detail role state, brief-picker contrast, SX-03 notice. Re-walked per role; frontend 458/458, build green, official e2e back to baseline after one transient API-unreachable flake.
