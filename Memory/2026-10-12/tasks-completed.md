# 2026-10-12

## rcfworks — 3S0-DATA-01: event taxonomy audit (Code review)

Phase 3 has opened. Its Sprint 0 tasks waited only on "Phase 2 complete", which was met when 2S8-PMO-01 was signed off on 2026-10-09. **3S0-PMO-01 and 3S0-PMO-02 are now Ready.** Every other Phase 3 row stays Blocked behind Sprint 0.

- **Delivered:** `documentation/SponsorX-Event-Taxonomy-Audit.md`. It covers every event the backend writes, with its definition, source and known gaps.
  - **Nine families:** reward funnel, tracking-link clicks, edition engagement, MetricDaily, AuditLog, money, inbound provider events, outbox jobs and sweeps, and email.
  - **AuditLog:** 287 `audit()` sites in 77 files plus one raw insert. They produce about 320 action names in 72 families; Appendix A lists them all.
  - **Jobs:** 22 job names and 22 interval sweeps.
  - **No client-side analytics** exist in the frontend.
- **How it was counted:** a TypeScript-AST scan of `backend/src`, `worker` and `scripts`. It resolves constants such as `AUDIT_ACTIONS.x.y`. The 35 action names built at runtime were expanded by hand.
- **Gaps worth knowing now** (17 in total, G1–G17 in the doc):
  - **G1:** `notify.campaignLive` is enqueued on every launch and has no consumer, so the rows stay in `OutboxJob` forever.
  - **G2:** `RewardEvent.city`/`region` are never filled. The geo job only resolves `LinkEvent`.
  - **G3:** `GEOLITE2_CITY_PATH` is unset everywhere, so clicks have no geography either.
  - **G4:** refused repeat redemptions are not recorded.
  - **G7:** `MetricDaily` has no timestamp, and a same-source correction overwrites the row.
  - **G9:** one listing archive is logged as both `listing.archive` and `listing.archived`, and `listing.request_changes` is snake_case.
  - **G13:** `role.grant`/`role.revoke`/`tenant.accessGrant` are declared but never written. Roles are set only when an account is created or closed, and those acts are audited.
- **Follow-ups suggested, not raised:** code fixes for G1, G2, G4 and G9. G3 is already on P2-OPS-04. The rest are absorbed by 3S0-DATA-02, 3S1-DATA-01/03, 3S8-DATA-01 and 3S0-PMO-01.
- **Tracker:** Phase 3 rows 5–6 (PMO-01, PMO-02) are now Ready; row 7 (DATA-01) is Code review with owner rcfworks, started 2026-10-12. The Phase 3 plan's markers match. The Stage Progress snapshot is unchanged: today's row already exists and covers Phase 1, which this work doesn't touch.
- **PRs:** `main` and `main_development` hold the same content (main's four extra commits are only merge commits). This branch merged `main_development` before starting.

## rcfworks — 3S0-BE-01…05: five gaps from the event audit, fixed (Code review)

The user decided each one: market geography from registration plus a reward venue, build the live email, count refused redemptions, and use one archive name.

- **3S0-BE-01 · Metric timestamps.**
  - `MetricDaily.createdAt` is the first recording and never moves; `updatedAt` is the latest correction.
  - Migration `20261012100000_metric_daily_timestamps` dates existing rows from their `metric.record` audit rows.
  - `POST /deliverables/{id}/metrics` now answers with the `MetricEntry` schema (`recordedAt`, `updatedAt`).
- **3S0-BE-02 · Campaign-live email.**
  - `src/domain/campaign-live-mail.ts` consumes `notify.campaignLive`, now in `HANDLED_JOBS`, and sends template `campaign.live`.
  - Recipients: the sponsor's admins (that sponsor only, not disabled), and each athlete on an ACTIVE order at their own login, plus the guardian while `guardianControls` holds. One email per address; key `campaign.live:<campaign>:<email>`.
  - A campaign that is not ACTIVE sends nothing.
  - Migration `20261012100300_campaign_live_backlog` marks every waiting row dispatched, with `payload.skipped`, so the deploy sends no stale news.
- **3S0-BE-03 · Archive name.** The seller's archive is now `listing.archive`. Old `listing.archived` rows stay, since the audit log is append-only; the audit doc maps the old name to the new one.
- **3S0-BE-04 · Refused redemptions.**
  - `RewardToken.refusedRedeems` and `lastRefusedRedeemAt` move when a used code is tried again (ALREADY_USED or the unique index). Other refusals don't count.
  - The count is written after the refusal, and a failed count never changes the 409.
  - `GET /rewards/{id}` returns both per token.
  - Migration `20261012100100_reward_token_refused_redeems`.
- **3S0-BE-05 · Reward venue.**
  - `Reward.venueCity` and `venueStateCode`: an optional `venue {city, stateCode}` on create, US states only, returned on read and null when not given.
  - Migration `20261012100200_reward_venue`.
  - **3S0-FE-01** (Ready, for HeckerCreatives): the venue field on the reward form.
- **Verified:**
  - against a local Postgres: an embedded-postgres in the session scratchpad, with `sponsorx.audit_purge = 'on'` as CI's test database has;
  - backend `tsc` and eslint clean;
  - **full backend suite 191 files / 3,070 tests pass**.
  - `prisma migrate diff` shows no drift on the three changed tables. It still reports 16 older lines (two foreign keys and an index rename), not touched here.
- **Tracker:** Phase 3 rows 48–53 were appended (Order 3.1–3.6). The autofilter, conditional formatting, Status validation and 15 Dashboard formulas now reach row 53. 3S0-DATA-01 notes and Unblocks are updated. The Phase 3 plan has the six tasks (Sprint 0 is now 12 tasks · 28 days; the phase is 50 · 192). The audit doc is v1.1, with the market-geography rule in §6.

## rcfworks — 3S0-DATA-01 and 3S0-BE-01…05 → Done

- **Acceptance checked clause by clause** at the user's request; every clause has a passing test (7 files, 138 tests) or, for DATA-01, the document.
- The audit doc's inventory (§3 A and D) now also names the fields the fixes added, so it matches the code.
- **Tracker and plan:** the six rows are Done (Date Done 2026-10-12). 3S0-DATA-02 is **Ready**, since its only prerequisite was DATA-01. 3S0-FE-01 stays Ready for HeckerCreatives.

## rcfworks — 3S0-DATA-02: warehouse schema and semantic layer (Code review)

- **PR:** #184 (https://github.com/BTG-Sports/sponsorX_dev/pull/184), the same branch as DATA-01 and BE-01…05.
- **Delivered:** `documentation/SponsorX-Warehouse-Schema.md`. It reads the spec from Drive (`BTG_SponsorX_Phases_2_4_Detailed_Developer_Specifications.docx`, §15/§19/§20/§22).
- **The user's decisions:**
  - grain is campaign × athlete × channel × day;
  - the warehouse is a separate Postgres database on Railway;
  - sponsor, property and athlete keep history (type 2).
- **Inventory joins the grain,** because an athlete can hold several jobs on one campaign (`CampaignOrder` is unique on campaign + athlete + job).
- **Findings that shaped it:**
  - No product table has a channel or platform. Channel is derived (published-URL host, in-person jobs, reward QR, tracking link, edition print/digital); open item O1 suggests a `Deliverable.platform`.
  - Marketplace orders belong to no campaign, so they get a companion fact.
  - Spec §19's other tables (pricing_recommendations and the rest) are product tables built by their own tasks, not warehouse tables.
- **Design rules:**
  - every measure is dated by its own event, so the fact is additive and reconciliation is exact (zero tolerance);
  - no personal data in the warehouse;
  - market comes from registration plus the reward venue, never from IP.
- **Verified:** the Appendix A SQL ran clean in an empty Postgres (10 tables and a view), and a smoke row read back through `sem.campaign_daily`.
- **Left:** the user's review sign-off in §10, then Done.
