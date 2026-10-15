# SponsorX Anomaly Detection

**Task `3S8-DATA-01` · Version 1.0 · 2026-10-15 · Phase 3, Sprint 8**

Every night, SponsorX checks the last 30 days for figures that look wrong. What
it flags waits in the data quality console (`3S8-FE-01`,
`/admin/intelligence/anomalies`; contract `frontend/src/lib/anomalies-live.ts`),
where BTG decides each one. Every flag is a rule's claim, not a fact. Each one
carries its rule, the rule's version (`anomaly-rules@1.0.0`) and the evidence
in words.

## 1 · The rules

| Kind | Rule | Flags | Severity |
|---|---|---|---|
| Spike | `spike.views` | One deliverable's views from one source on a day at **5×** its usual day: the median of its earlier days in the last 14, at least 3 of them, and at least 1,000 views | high at 10× |
| Duplicate | `duplicate.post` | The **same post URL** on two deliverables, ignoring case, query and trailing slash. The later one would count it twice. | medium |
| Bot | `bot.clicks` | A tracking link clicked **30 times inside one minute** | high at 100 |
| Redemption | `redemption.burst` | A reward redeemed **10 times inside 5 minutes** | high |
| Redemption | `redemption.repeat_fan` | One fan (by email) redeeming the same reward **3 times**. The email is masked in the evidence. | medium |
| Manual entry | `manual.over_measured` | A hand-entered day (manual or self-reported) at **3×** what the API measured that day | medium |
| Manual entry | `manual.engagement_over_views` | A hand-entered day with more engagements than views | low |

- **Each flag is kept once,** by a fingerprint, however many nights it is seen.
- **A tenant whose fact check failed** is not checked that night.

## 2 · Deciding a flag

There are three outcomes. Every one needs a note of 8 to 2,000 characters and
is audited (`anomaly.dispose`):
- **confirmed issue**;
- **false positive**;
- **exclude from reporting**. For now this records the decision and flags the
  figure (user, 2026-10-15). Taking excluded figures out of sponsor reports is
  a later task.

**A person's decision is final:** a second one is refused with 409.

**Automation first** (user, 2026-10-15). SponsorX decides the clear-cut case
itself: a **duplicate post is excluded from reporting automatically**, with
the reason, because a post can never count twice. That is audited as
`anomaly.autoDispose`, with no actor.

A person may replace an automatic decision. Spikes, bot clicks, redemptions
and manual entries need judgement, so they wait for a person.

## 3 · Endpoints and who

- `GET /intelligence/anomalies?tab=open|resolved&kind&page&size`:
  - **open:** highest severity first, then newest, then by rule;
  - **resolved:** newest decision first;
  - **counts:** open, resolved, and open by kind;
  - **`asOf`:** when the rules last ran.
- `POST /intelligence/anomalies/{anomalyId}/disposition { outcome, note }`.
- **Who** (`anomaly`, RBAC matrix §34): BTG admins and campaign managers. A flag in another tenant answers 404.
- **When:** nightly, after the make-goods. `npm run anomalies:refresh -- [--tenant <id>]` does the same by hand.

## 4 · Where it lives

- `backend/src/domain/anomaly-rules.ts`: the rules. No database access.
- `backend/src/domain/anomaly-engine.ts`: gathering, the nightly run, the console, decisions.
- The `Anomaly` and `AnomalyScan` tables (migration `20261015150000_scenarios_anomalies_zoho_intel`).
- **Proof:** `backend/tests/anomalies.test.ts`. Seeded duplicate, bot, redemption, spike and manual-entry patterns go through the real nightly run. All seven are flagged once, and the duplicate is excluded automatically. It also covers the console, decisions, replacing an automatic one, roles and tenants.
