# SponsorX · Production go/no-go review

**Task:** `P8-PMO-06` · Production go/no-go review
**Done when:** §37's pre-pilot and pre-sponsor-pilot gates formally signed off
**Prepared:** 2026-10-20 by rcfworks, from `main_development` at `08f10a6b` (staging and production run release `1b198d4b`)
**Status:** **Draft, decision pending.** The software is ready. **Updated 2026-10-22:** every legal and policy item is approved and the wording is live in the app (`P8-BE-07`), so both pilot gates are met on paper. What remains is the owner's go-live switches and the production check. Nothing is signed.
**For:** the programme owner (Rodney), the user signing with Rodney's delegated authority, and counsel for the items marked *counsel*

## The decision in one paragraph

Everything buildable for the SponsorX web app is built, tested and running on
staging and production. That covers Phases 1–3, and Phase 4 as built.
Phases 1, 2, 3 and 4 are each signed off. What stands between today and
real users is not code:
- ~~**Counsel's approvals,** which §37 requires before the athlete pilot and the sponsor pilot.~~ **Approved 2026-10-22** and issued as v2 of every agreement (`P8-BE-07`).
- **The owner's production switches:** payments, Zoho, MFA and a few settings.

**Recommendation:**
- **No-go for real outside users today,** because the owner's production switches are off and production hasn't been checked. *(Until 2026-10-22 the pilot gates were open too; the legal approvals have since closed them.)*
- **Go for getting production ready now:** the switches below, the production check, and a BTG-internal dry run on production with no real money.
- **Then a second, short review** that signs the gates and the decision.

## Where each phase stands

| Phase | Tasks | Accepted | Open, and why it doesn't block the web app |
|---|---|---|---|
| 1 · Managed marketplace | 292 done of 301 (4 dropped) | Signed off 2026-10-16 (`SponsorX-Phase1-Acceptance.md`) | **This review** (P8-PMO-06). **MFA and production settings,** which are go-live switches (P2-INT-02, P2-OPS-04). **SponsorX NEXT edition one actually sold** (P9-DATA-01, P9-PMO-03), which is a business milestone, not code. |
| 2 · Marketplace & commerce | 134 of 140 | Signed off 2026-10-09 (`SponsorX-Phase2-Acceptance-Signoff.md`), wallet deferred | **The wallet passes** (parked by Rodney). **The first real outside team** (2S8-PMO-03), which happens after go-live. |
| 3 · Intelligence & attribution | 62 of 62 | Signed off 2026-10-16 (`SponsorX-Phase3-UAT.md`) | — |
| 4 · INFINEX, as built | 19 of 19 | Signed off 2026-10-20 (`SponsorX-Phase4-Acceptance-Signoff.md`) | The rest waits for the game (parked), in Phase 6 |

## §37 · The gates, condition by condition

§37 of the Blueprint ("Developer Go/No-Go Gates") sets a condition for each
step. This task signs the two pilot gates; the others are recorded for
completeness.

### Before coding Phase 1 — **Met**

| Condition | Evidence |
|---|---|
| User roles | RBAC matrix (P0-PMO-07), enforced and pinned by test |
| Legal agreement metadata | The agreement model and versioned click-wrap acceptance (Phase 1, built) |
| SX job catalogue | P0-PMO-09, plus a catalogue per tenant (P8-BE-01) |
| Sponsor packages | P0-PMO-10, with the margin floor rule (P0-PMO-13) |
| Zoho module mapping | P0-PMO-08 (`SponsorX-Zoho-Field-Mapping.md`) |
| Phase 1 payment policy | P0-PMO-01 (`SponsorX-Phase1-Payment-Policy.md`) |

### Before the athlete pilot — **Met 2026-10-22** (to be signed below)

| Condition | Status | What closes it | Owner |
|---|---|---|---|
| Agreement templates approved | **Met** | P0-LEG-01 (Content Collaboration Agreement) and P0-LEG-02 (Campaign Order template). Approved 2026-10-22 by rcfworks with Rodney's delegated authority (SponsorX Legal folder); issued in the app as v2 (`P8-BE-07`). | — |
| Athlete and guardian compliance checklist approved | **Met** | P0-LEG-06: the athlete-responsibility wording (athlete agreement §9–10, Guardian Agreement §5). The athlete (or guardian) confirms their own rules (P8-BE-02), and a disputed deal is paused for documents (P8-BE-03). P0-LEG-03: **click-to-accept by a verified guardian (Option A, as built).** Approved 2026-10-22 by rcfworks with Rodney's delegated authority (SponsorX Legal folder); issued in the app as v2 (`P8-BE-07`). | — |
| Data privacy defined | **Met** | P0-LEG-04: the two consent boxes (the sponsor named in the second), the fan privacy notice (`GET /public/fan-privacy`: email deleted 90 days after the claim, data in the US) and the fan email footer. Approved 2026-10-22 by rcfworks with Rodney's delegated authority (SponsorX Legal folder); issued in the app as v2 (`P8-BE-07`). BTG's postal address is a go-live switch below. | — |
| Payout process defined | **Met** | **Phase 1:** the payment policy (status tracking only, no tax IDs). **Phase 2:** 2S0-LEG-01 (marketplace seller, payout and order terms) and 2S0-LEG-02 (the tax position: Stripe collects tax forms and files the 1099s; a minor's in the minor's name; SponsorX stores no tax ID). Approved 2026-10-22 by rcfworks with Rodney's delegated authority (SponsorX Legal folder); issued in the app as v2 (`P8-BE-07`). | — |

### Before the sponsor pilot — **Met 2026-10-22** (to be signed below)

| Condition | Status | What closes it | Owner |
|---|---|---|---|
| Package economics approved | **Met** | P0-PMO-09, P0-PMO-10, P0-PMO-13 | — |
| Tracking and report labels defined | **Met** | The report format (P0-PMO-05) and the attribution claim classes (3S0-PMO-01, `SponsorX-Attribution-Claims.md`). The sponsor-facing attribution wording (3S0-LEG-01) was approved 2026-10-22: the report is now the "Campaign Results Report", with the approved foot note (`P8-BE-07`); the results screen's labels are `P8-FE-08`. | — |
| Reward terms reviewed | **Met** | P0-LEG-05: the sponsor-responsibility paragraph for rewards (Marketplace Order Terms B7). The app runs instant rewards only, and BTG pauses a reward anyone objects to. Approved 2026-10-22 by rcfworks with Rodney's delegated authority (SponsorX Legal folder); issued in the app as v2 (`P8-BE-07`). | — |

### Before Phases 2, 3 and 4 — **Met**, or **not applicable**

| Gate | Status |
|---|---|
| Before Phase 2: Phase 1 campaigns reliable; state machines, tenant isolation and earnings reconciliation stable | **Met.** Phase 1 accepted; the tenant-isolation sweep and the nightly fact check run in CI and on staging. |
| Before Phase 3: clean history, or rules-based intelligence with explicit confidence labels | **Met** the second way: every figure carries its confidence and model version |
| Before Phase 4: INFINEX runtime selected; stable world and placement IDs and telemetry schema | **Not applicable.** The game is parked. Stable IDs and the schema are built, and the runtime is Phase 6's. |

## Production: the owner's go-live switches

**Where it stands, 2026-10-24.** Going live waits on **Stripe** (Rodney's identity verification). Still to do:
- MFA (Clerk Pro);
- fan geography;
- Stripe tax reporting;
- BTG's postal address;
- the rest of the production check;
- the signatures below.

Done: the edge key, Resend email and Zoho (2026-10-24).

Production runs the same code as staging. It is deployed from `release` by
the same workflow, but it is effectively dark. These are switched on by the
owner at go-live. None of them needs code.

| Switch | Today | To go live | Task |
|---|---|---|---|
| Payments | **Pending (2026-10-24).** Stripe is waiting on Rodney's identity verification (started 2026-10-21). The live restricted key was **cancelled 2026-10-22** after Railway's incident, so no live key exists. `PAYMENT_PROVIDER` unset; no live webhooks. Connect is enabled on live, with 0 connected accounts. | When Rodney's verification clears: create the live keys, set them on Railway production, register the live webhooks in the Stripe Dashboard, set `PAYMENT_PROVIDER=stripe`, and confirm Connect's business model ("collect payments and pay recipients") | Owner |
| Zoho | **Done 2026-10-24.** Production is connected to the real CRM (org `4857533000000020005`) with its own refresh token, owned by **rcfworks** (`SponsorX-Zoho-Credentials-and-Sandbox.md` §9). `ZOHO_EXPECTED_ORG_ID` pins the org. The CRM notification channel is live at `https://sponsorx.net/api/v1/webhooks/zoho/crm` (`zoho.watch renewed`). The two intelligence fields were created on Accounts | — | P2-OPS-04 |
| MFA for admin and finance | Not available: needs Clerk Pro | Upgrade to Clerk Pro, then require MFA for privileged roles in production | P2-INT-02 |
| Fan rate limiting | **Done 2026-10-23.** `SPONSORX_EDGE_KEY` is set on production web and api (rotated after Railway's incident) | — | P2-OPS-04 (P8-SEC-03) |
| Fan geography | `GEOLITE2_CITY_PATH` unset | Set it on production | P2-OPS-04 |
| Tax forms | Stripe Connect tax reporting off | 2S0-LEG-02 approved 2026-10-22: switch on tax reporting for connected accounts in the Stripe Dashboard. Stripe then collects W-9 and W-8 forms and files the 1099s. | Owner |
| Email | **Done 2026-10-23.** Domain verified in Resend (`sponsorx.net`); `RESEND_API_KEY` is set on the production api (rotated after Railway's incident) | — | Owner |
| Phase 3 rollout | Per-tenant feature switches | Stage 3 (outside sponsors and properties): 3S0-LEG-01 approved 2026-10-22, so this is the owner's call | Owner |
| BTG's postal address | `BTG_POSTAL_ADDRESS` unset: fan emails and the fan privacy notice leave the address out | Set it on the production api and worker before the first fan email goes out (CAN-SPAM wants it in each one) | Owner |
| Governing law | The approved agreements (v2) name no governing law, venue or dispute process | Optional: when BTG chooses them, issue v3 of the agreements with that section; everyone re-accepts | Owner |
| Production check | **Partly done 2026-10-23:** health returns 200 with every check ok (database, Redis, storage, backups, queue); public pages and the webhook paths answer as expected | Someone with production access runs the rest of the Deployment Runbook's production checks | Owner or rcfworks |

## Risks to accept or close

- **Production has never been checked by the person preparing this.** The production switches above, and a production health check, need someone with production access.
- **The "Tracker sync" workflow fails on and off** (the Google Sheet endpoint answers 404). It's not part of the product, but the published status Sheet can lag.
- **SponsorX NEXT is built but unproven commercially** (P9-DATA-01: one edition sold, 20 local advertisers). It can launch with the rest, but whether it works is still a business question.

## The decision

Choose one, and record it below:

1. **No-go, with production readiness in parallel** *(recommended)*.
   - **Meanwhile:** turn on the switches that need no counsel (Clerk Pro MFA, the edge key, geography, the email domain), run the production check, and do a BTG-internal dry run on production with no real money.
   - **Then** (the legal approvals arrived 2026-10-22): sign the gates in a short second review, switch on payments and Zoho, and onboard the first real outside team (2S8-PMO-03).
2. **Go for a limited pilot now,** accepting the open counsel items as a stated risk. §37 says the pilot gates come first, so this needs the owner's explicit written acceptance of each open item.
3. **No-go,** and revisit at a set date.

## Sign-off

*Not signed. To be completed by the programme owner, or by the user signing with Rodney's delegated authority, once the gates below are met or each open item is explicitly accepted.*

- **Before the athlete pilot** (templates, compliance checklist, privacy, payout process): ☐ met · ☐ accepted with open items: ______ · Signed: ______ · Date: ______
- **Before the sponsor pilot** (package economics, report labels, reward terms): ☐ met · ☐ accepted with open items: ______ · Signed: ______ · Date: ______
- **Decision** (1, 2 or 3 above): ______ · Signed: ______ · Date: ______
