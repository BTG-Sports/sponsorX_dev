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
