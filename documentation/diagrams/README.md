# SponsorX Phase 1 — diagrams

The two §38 diagram deliverables, `P0-ART-01` and `P0-ART-02`. Both are drawn as
**Mermaid source committed here**, with a PDF rendered from that source for
distribution. The source is the deliverable; the PDF is a copy of it.

| | Source | Rendered |
|---|---|---|
| **ERD** (`P0-ART-01`) | [`SponsorX-Phase1-ERD.mmd`](./SponsorX-Phase1-ERD.mmd) | [`SponsorX-Phase1-ERD.pdf`](./SponsorX-Phase1-ERD.pdf) — one A0 landscape sheet · [`.svg`](./SponsorX-Phase1-ERD.svg) |
| **State machines** (`P0-ART-02`) | [`state-machines/*.mmd`](./state-machines) — eight files | [`SponsorX-Phase1-State-Machines.pdf`](./SponsorX-Phase1-State-Machines.pdf) — 9 pages, A3 portrait · [`svg/`](./state-machines/svg) |

**Sources of truth.** Blueprint v2.0 §20 (tables) and §21 (state machines), as
modelled in [`../SponsorX-Implementation-Guide-V2.md`](../SponsorX-Implementation-Guide-V2.md).
Nothing here invents a table, a column or a state.

## Regenerating

Mermaid is **not** a project dependency — the repo stays at zero new
dependencies until B0 completes. Render from a throwaway install outside the
project:

```bash
mkdir -p /tmp/mmd && cd /tmp/mmd && npm init -y
PUPPETEER_SKIP_DOWNLOAD=1 npm install @mermaid-js/mermaid-cli
echo '{ "executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" }' > pup.json
# ERD — elk layout keeps 29 entities close to A0's aspect ratio
npx mmdc -i SponsorX-Phase1-ERD.mmd -o erd.svg -p pup.json -b white \
  -c '{"layout":"elk","theme":"base"}'
```

The PDFs are printed from the SVGs through headless Chrome with a print
stylesheet (`@page { size: 1189mm 841mm }` for the ERD, `A3 portrait` for the
machines). Chrome does **not** recognise `size: A0` — give explicit millimetres.
Mermaid also drops the newline after a bare `%%` line, which corrupts the
diagram declaration; every comment line in these sources therefore carries text.

**Regenerate both after any schema change.** They are generated artefacts, not
hand-drawn pictures, and a stale ERD is worse than none.

## §20 coverage — read this before writing the schema in `P2-BE-02`

Every §20 table is accounted for below. Five rows are **not yet modelled** and
one is modelled differently from how §20 and `CLAUDE.md` describe it. These are
findings for `P2-BE-02` to settle, not decisions taken here.

| §20 table | In the ERD as | Note |
|---|---|---|
| `tenants` | `TENANT` | |
| `users` / `roles` / `user_roles` | `USER` only | **Discrepancy.** V2 carries `roles Role[]` on the user row. §20 and `CLAUDE.md` both describe `roles` and `user_roles` as tables. An array cannot carry a role grant's scope, grantor or grant date. |
| `sponsors` / `sponsor_contacts` | `SPONSOR` only | **Not modelled:** `sponsor_contacts`. §18 makes Zoho Contacts bi-directional, so the contact needs somewhere to land. |
| `properties` | `PROPERTY` | |
| `athletes` | `ATHLETE` | |
| `guardians_authorized_reps` | `GUARDIAN` | |
| `athlete_applications` | folded into `ATHLETE.state` | Deliberate — one row, one lifecycle. Consequence: no review history separate from the athlete record; `AUDIT_LOG` carries it instead. |
| `athlete_social_accounts` | `ATHLETE_SOCIAL` | |
| `athlete_content_capabilities` | — | **Not modelled.** Video / photo / story / appearance flags. Matching reads these. |
| `athlete_brand_preferences` | — | **Not modelled.** Interested and restricted categories. §26's conflict check needs the athlete's restricted list; the ERD currently has categories only on `CAMPAIGN_BRIEF`, which is the sponsor's side of the same test. |
| `athlete_scores` | `ATHLETE_SCORE` | |
| `agreements` | `AGREEMENT` + `AGREEMENT_ACCEPTANCE` | Acceptance split out to carry the body hash per signer. |
| `nil_jobs` | `NIL_JOB` | |
| `athlete_rates` | `ATHLETE_RATE` | |
| `sponsor_packages` | `SPONSOR_PACKAGE` | `inventory` is JSON until `P0-PMO-10` names each package's job codes. |
| `campaign_briefs` | `CAMPAIGN_BRIEF` | |
| `campaigns` | `CAMPAIGN` | |
| `campaign_athletes` | `CAMPAIGN_INVITE` | |
| `campaign_orders` | `CAMPAIGN_ORDER` | |
| `deliverables` | `DELIVERABLE` | |
| `creative_assets` | `CREATIVE_ASSET` | |
| `tracking_links` | `TRACKING_LINK` + `LINK_EVENT` | |
| `metric_events` / `metric_aggregates` | `METRIC_DAILY` + `LINK_EVENT` | Aggregates are computed by the worker, not stored as a table. |
| `rewards` / `qr_codes` / `reward_claims` / `redemptions` | `REWARD` + `REWARD_TOKEN` + `REWARD_EVENT` | Four tables folded into three: a claim and a redemption are both `REWARD_EVENT` rows distinguished by `type`, which is what lets the partial unique index enforce REDEEM once-forever. |
| `earnings` | `EARNING` | |
| `payouts` | — | **Deliberately absent**, not a gap. The Phase 1 Payment Policy (G-01) tracks earning *status* only; no bank details, no tax IDs (§26). |
| `audit_logs` | `AUDIT_LOG` | |
| `integration_connections` / `webhook_deliveries` | `WEBHOOK_DELIVERY` + `OUTBOX_JOB` | **Not modelled:** `integration_connections` — where a Zoho connection's tokens and sync cursor live. |

## §21 coverage

All eight machines are drawn, including the two §38 names explicitly — Athlete
Application and Campaign Order. Every unlabelled arrow is taken verbatim from
§21.

**Arrows labelled “(derived)” are not in §21.** §21 states forward paths only,
which leaves several states as dead ends: a review that requests changes, a
payment hold that is resolved, a pause that is lifted. Those return arrows are
drawn and marked. They are proposals for `P2-BE-02` to confirm when the enums
and transition guards are written — **nine arrows across six machines**
(Athlete Application 2, Campaign Order 1, Deliverable 2, Campaign 1,
Earnings 2, Reward 1). Campaign Brief and Athlete Invitation need none: §21's
own paths already terminate.
