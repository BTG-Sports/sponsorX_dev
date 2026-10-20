# SponsorX · Production go/no-go review

**Task:** `P8-PMO-06` · Production go/no-go review
**Done when:** §37's pre-pilot and pre-sponsor-pilot gates formally signed off
**Prepared:** 2026-10-20 by rcfworks, from `main_development` at `08f10a6b` (staging and production run release `1b198d4b`)
**Status:** **Draft, decision pending.** The software is ready. The two pilot gates are not met yet: they wait on counsel and on the owner's go-live switches. Nothing is signed.
**For:** the programme owner (Rodney), the user signing with Rodney's delegated authority, and counsel for the items marked *counsel*

## The decision in one paragraph

Everything buildable for the SponsorX web app is built, tested and running on
staging and production. That covers Phases 1–3, and Phase 4 as built.
Phases 1, 2, 3 and 4 are each signed off. What stands between today and
real users is not code:
- **Counsel's approvals,** which §37 requires before the athlete pilot and the sponsor pilot.
- **The owner's production switches:** payments, Zoho, MFA and a few settings.

**Recommendation:**
- **No-go for real outside users today,** because the pilot gates are open.
- **Go for getting production ready meanwhile:** the switches that don't need counsel, and a BTG-internal dry run on production with no real money.
- **Then a second, short review** that signs the gates once counsel's answers arrive.

## Where each phase stands

| Phase | Tasks | Accepted | Open, and why it doesn't block the web app |
|---|---|---|---|
| 1 · Managed marketplace | 292 done of 301 (4 dropped) | Signed off 2026-10-16 (`SponsorX-Phase1-Acceptance.md`) | **This review** (P8-PMO-06). **MFA and production settings,** which are go-live switches (P2-INT-02, P2-OPS-04). **SponsorX NEXT edition one actually sold** (P9-DATA-01, P9-PMO-03), which is a business milestone, not code. |
| 2 · Marketplace & commerce | 134 of 140 | Signed off 2026-10-09 (`SponsorX-Phase2-Acceptance-Signoff.md`), wallet deferred | **The wallet passes** (parked by Rodney). **The first real outside team** (2S8-PMO-03), which happens after go-live. |
| 3 · Intelligence & attribution | 62 of 62 | Signed off 2026-10-16 (`SponsorX-Phase3-UAT.md`) | — |
| 4 · INFINEX, as built | 19 of 19 | Signed off 2026-10-20 (`SponsorX-Phase4-Acceptance-Signoff.md`) | The rest waits for the game (parked), in Phase 5 |

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

### Before the athlete pilot — **Not met: waits on counsel**

| Condition | Status | What closes it | Owner |
|---|---|---|---|
| Agreement templates approved | **Open** | P0-LEG-01 (Content Collaboration Agreement) and P0-LEG-02 (Campaign Order template), each delivered, versioned and approved for production use | Counsel |
| Athlete and guardian compliance checklist approved | **Open** | P0-LEG-06, redefined 2026-10-20: counsel approves the athlete-responsibility wording in the athlete agreement. The athlete (or guardian) confirms their own rules (P8-BE-02), and a disputed deal is paused for documents (P8-BE-03). P0-LEG-03: whether click-wrap is enough for a guardian, or which e-sign vendor (Blocked). | Counsel |
| Data privacy defined | **Open** | P0-LEG-04: consent wording for scan → claim → redeem, purpose limitation, and what sponsors receive. Counsel's §37 pre-pilot privacy review (recorded open in `.claude/stack-decision.md` A7). | Counsel |
| Payout process defined | **Partly** | **Phase 1:** the payment policy is written (status tracking only, no tax IDs). **Phase 2 moves real money by Stripe transfer,** so it also needs 2S0-LEG-01 (marketplace and payout terms) and 2S0-LEG-02 (tax ID collection, withholding and 1099 position). | Counsel |

### Before the sponsor pilot — **Not met: one item waits on counsel**

| Condition | Status | What closes it | Owner |
|---|---|---|---|
| Package economics approved | **Met** | P0-PMO-09, P0-PMO-10, P0-PMO-13 | — |
| Tracking and report labels defined | **Met** | The report format (P0-PMO-05) and the attribution claim classes (3S0-PMO-01, `SponsorX-Attribution-Claims.md`). Counsel's review of the sponsor-facing attribution wording (3S0-LEG-01) is still open. Until it closes, Phase 3's attribution shows only on BTG's own desks (stage 1 of the staged rollout in `SponsorX-Phase3-UAT.md`). | Counsel for 3S0-LEG-01 |
| Reward terms reviewed | **Open** | P0-LEG-05: written confirmation of which reward types (sweepstakes, coupons and so on) are permitted in the target states | Counsel |

### Before Phases 2, 3 and 4 — **Met**, or **not applicable**

| Gate | Status |
|---|---|
| Before Phase 2: Phase 1 campaigns reliable; state machines, tenant isolation and earnings reconciliation stable | **Met.** Phase 1 accepted; the tenant-isolation sweep and the nightly fact check run in CI and on staging. |
| Before Phase 3: clean history, or rules-based intelligence with explicit confidence labels | **Met** the second way: every figure carries its confidence and model version |
| Before Phase 4: INFINEX runtime selected; stable world and placement IDs and telemetry schema | **Not applicable.** The game is parked. Stable IDs and the schema are built, and the runtime is Phase 5's. |

## Production: the owner's go-live switches

Production runs the same code as staging. It is deployed from `release` by
the same workflow, but it is effectively dark. These are switched on by the
owner at go-live. None of them needs code.

| Switch | Today | To go live | Task |
|---|---|---|---|
| Payments | `PAYMENT_PROVIDER` unset; no live Stripe secret key; no live webhooks. Connect is enabled on live, with 0 connected accounts. | Create the live keys, set them on Railway production, register the live webhooks in the Stripe Dashboard, set `PAYMENT_PROVIDER=stripe`, and confirm Connect's business model ("collect payments and pay recipients") | Owner |
| Zoho | No production keys | Set the Zoho keys on the production worker (and the webhook secret on web), then create the two intelligence fields (`npm run zoho:intel-fields -- --create --confirm-production`) | P2-OPS-04 |
| MFA for admin and finance | Not available: needs Clerk Pro | Upgrade to Clerk Pro, then require MFA for privileged roles in production | P2-INT-02 |
| Fan rate limiting | `SPONSORX_EDGE_KEY` unset, so all fans share one bucket | Set it on production web and api | P2-OPS-04 (P8-SEC-03) |
| Fan geography | `GEOLITE2_CITY_PATH` unset | Set it on production | P2-OPS-04 |
| Email | Resend chosen (P0-PMO-03, G-04) | Confirm the production sending domain is verified (DKIM, SPF) and live | Owner |
| Phase 3 rollout | Per-tenant feature switches | Stage 3 (outside sponsors and properties) only after 3S0-LEG-01 | Owner |
| Production check | Not run by Claude (production reads are blocked for it) | Someone with production access runs the Deployment Runbook's production checks | Owner or rcfworks |

## Risks to accept or close

- **Production has never been checked by the person preparing this.** The production switches above, and a production health check, need someone with production access.
- **The "Tracker sync" workflow fails on and off** (the Google Sheet endpoint answers 404). It's not part of the product, but the published status Sheet can lag.
- **SponsorX NEXT is built but unproven commercially** (P9-DATA-01: one edition sold, 20 local advertisers). It can launch with the rest, but whether it works is still a business question.

## The decision

Choose one, and record it below:

1. **No-go, with production readiness in parallel** *(recommended)*.
   - **Meanwhile:** turn on the switches that need no counsel (Clerk Pro MFA, the edge key, geography, the email domain), run the production check, and do a BTG-internal dry run on production with no real money.
   - **When counsel's answers arrive:** sign the gates in a short second review, then switch on payments and Zoho and onboard the first real outside team (2S8-PMO-03).
2. **Go for a limited pilot now,** accepting the open counsel items as a stated risk. §37 says the pilot gates come first, so this needs the owner's explicit written acceptance of each open item.
3. **No-go,** and revisit at a set date.

## Sign-off

*Not signed. To be completed by the programme owner, or by the user signing with Rodney's delegated authority, once the gates below are met or each open item is explicitly accepted.*

- **Before the athlete pilot** (templates, compliance checklist, privacy, payout process): ☐ met · ☐ accepted with open items: ______ · Signed: ______ · Date: ______
- **Before the sponsor pilot** (package economics, report labels, reward terms): ☐ met · ☐ accepted with open items: ______ · Signed: ______ · Date: ______
- **Decision** (1, 2 or 3 above): ______ · Signed: ______ · Date: ______
