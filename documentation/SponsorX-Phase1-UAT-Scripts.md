# SponsorX Phase 1 · UAT Scripts

**Task `P8-QA-02` · Draft 0.2 · 2026-10-16 · Phase 1, Stage 8**

**Done when:** scripts exist for the athlete, sponsor, admin and fan journeys,
and they have been run with real pilot users on staging.

**Status.** These are the scripts. The "Criteria" column names the §30
criteria each step shows, numbered as in
[`SponsorX-Phase1-Acceptance.md`](./SponsorX-Phase1-Acceptance.md)
(`P8-QA-01`). Still to come:
- **The simulated-user run on staging** comes next: a browser script plays
  each person, as Phase 2's did (`backend/scripts/uat-phase2.mjs`).
- **The run with real pilot users** is BTG's.

**How to read a step.**
- **Who** does it.
- **Where:** the page, on staging (`https://web-staging-904a.up.railway.app`).
- **What they do**, and **what should happen**.

Anything held for BTG must say why, in words the person can act on. A step
fails if it errors, if it shows another person's or organisation's data, or if
it shows a figure with no source label.

**Before day 1.**
- **People sign up themselves,** through `/join` (athletes) and `/brief`
  (sponsors). The tester facility is not used: going through the real sign-up
  is part of the test.
- **Email links:** staging sends auth email from Clerk's test addresses
  (`+clerk_test`, code 424242). Participants use their own address, or the
  test pattern BTG gives them.
- **No real money moves.** Phase 1 tracks earnings and invoices only; Stripe
  is Phase 2.

The Phase 1 loop these follow (CLAUDE.md, §39): athlete application → approval
→ NIL job and rate → sponsor brief → matching → invitation → campaign order →
deliverable → tracking and reward → earnings → sponsor report.

## 1 · Athlete

| Step | Where | What they do | What should happen | Criteria |
|---|---|---|---|---|
| A1 | `/join` | Apply as an adult: sport, school or team, socials, the rates asked for each SX job, a government ID; click the email link | Approved and active automatically when every check passes; otherwise held with the reason. Sign-in works. | 1 |
| A2 | `/join` | Apply again as a **minor** (a second person) | Not active until a guardian is linked and verified; the guardian is asked by email | 1 |
| A3 | `/athlete/profile` | Check the profile; open the public page `/athletes/<slug>` | Public page shows only public fields: no date of birth, no contact details | 14 |
| A4 | `/athlete/profile` | Read the rate card | The rates BTG confirmed at approval (B1), one per SX job, as the athlete's pay | 2 |
| A5 | `/athlete/invitations` | Accept the invitation BTG sends (step B4) | Accepted; a campaign order appears with its dates and pay; its deliverables are created only now | 5, 6 |
| A6 | `/athlete/deliverables` | Submit the post's link for each deliverable | It goes to review; once approved, it shows as published with its own tracking link | 7, 8 |
| A7 | `/athlete/earnings` | Open earnings after the campaign completes | The earning shows its status (pending, eligible, paid); the athlete sees their pay, never the sponsor's price | 11 |
| A8 | Any page | Open another athlete's deliverable or earning link (BTG supplies it) | Refused | 14 |

## 2 · Sponsor

| Step | Where | What they do | What should happen | Criteria |
|---|---|---|---|---|
| S1 | `/brief` | Request access: company, contact, proof of business; click the email link | Account opens automatically when the checks pass; otherwise held with the reason; it reaches Zoho as an Account and Contact | 3, 12 |
| S2 | `/sponsor/marketplace` | Browse packages and NIL jobs | Sees the six packages and their prices as the sponsor pays them; never an athlete's pay | 3 |
| S3 | `/sponsor/requests` | Submit a brief: goal, budget, sports, states, dates | The brief is received and approved automatically, or held with the reason | 3 |
| S4 | `/sponsor/campaigns/<id>` | Follow the campaign as BTG stages it | Its stage and its athletes show; nothing from another sponsor | 10, 14 |
| S5 | `/sponsor/campaigns/<id>` | Approve the athlete's content when asked | Approval recorded; the content goes live | 7 |
| S6 | `/sponsor/campaigns/<id>/report` | Open the report; download the PDF | Campaign and per-athlete performance; every figure carries its source (verified, self-reported, estimated); redemptions, views and spend match what happened | 10 |
| S7 | Any page | Open another sponsor's campaign or report link (BTG supplies it) | Refused | 14 |

## 3 · BTG admin

| Step | Where | What they do | What should happen | Criteria |
|---|---|---|---|---|
| B1 | `/admin/applications`, `/admin/new-signups` | Find the athletes from A1 and A2 | Each shows its checks; the minor shows the guardian step; held ones show the reason, with approve and reject; approving confirms the rate card | 1, 2 |
| B2 | `/admin/briefs` | Find the sponsor's brief from S3 | Approved automatically, or held with the reason, ready to approve | 3 |
| B3 | `/admin/campaigns/match` | Match athletes to the brief | Ranked athletes with reasons; nobody unavailable, conflicted or unsafe; a minor never for a sensitive category | 4 |
| B4 | `/admin/campaigns/<id>` | Invite the chosen athlete; move the campaign through its stages | The invitation reaches the athlete (A5); stage moves are allowed only in order; the campaign's Deal goes to Zoho | 4, 12 |
| B5 | `/admin/approvals` | Review the athlete's deliverable (A6) | Request a revision with a note, then approve; mark it published; the sponsor is asked (S5) | 7 |
| B6 | `/admin/rewards/new`, `/print/reward` | Create the campaign's reward and print its QR | The QR opens the fan page (F1) | 9 |
| B7 | `/admin/finance` | Raise the campaign invoice; check the athlete's earning | The invoice goes to Zoho (queued); the earning matches the order | 11, 12 |
| B8 | `/admin/integrations` | Check Zoho sync and email | Healthy, or the failure is named | 12 |
| B9 | `/admin/audit` | Look up the campaign | Every stage move, approval and invoice is there, with who did it | 13 |

## 4 · Fan

| Step | Where | What they do | What should happen | Criteria |
|---|---|---|---|---|
| F1 | `/r/<token>` (QR) | Scan the reward's QR on a phone; no login | The page loads fast on a phone, with the offer and its terms; the scan is counted | 9 |
| F2 | `/r/<token>` | Claim, then redeem at the counter | Claim and redemption are counted separately; redeemed once | 9 |
| F3 | `/r/<token>` | Try to redeem the same code again | Refused: already used | 9 |
| F4 | `/sponsor/campaigns/<id>/report` (sponsor) | — | The redemption is counted, with no fan's identity | 9, 10 |

## 5 · What to record

For each step, record:
- pass or fail;
- the ids it made (athlete, brief, campaign, order, deliverable, reward,
  invoice);
- a screenshot;
- anything held or refused, with its reason.

The run's evidence goes to `documentation/uat-evidence/phase1-<run>/`
(`evidence.json` and `evidence.md`), as Phase 2's did, and a line goes in that
day's `Memory/` log.
