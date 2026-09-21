# SponsorX — Phase 1 Payment Policy

**Decision gate G-01 · Task `P0-PMO-01` · Version 0.1 (draft for signature) · 2026-09-15**

**Applies to:** Phase 1, the managed marketplace, for as long as BTG staff run
matching, pricing and invoicing by hand. It does not describe Phase 2.

---

## 1 · The decision

**In Phase 1, SponsorX records what an athlete has earned and whether they have
been paid. It does not move money, and it collects no tax identification.**

Money moves outside the platform, by the same means BTG already uses. The
platform is the record of what was promised and what was delivered; Zoho Books
remains the record of what was invoiced and what was received.

## 2 · What SponsorX stores

An earning is a record that an athlete has become entitled to a payment, and it
carries one status at a time:

| Status | Meaning |
|---|---|
| `PENDING` | The deliverable is not yet verified. Nothing is owed yet. |
| `ELIGIBLE` | The deliverable is verified. The athlete has earned it. |
| `APPROVED_FOR_PAYOUT` | BTG finance has approved it for payment. |
| `PAID` | BTG has paid it outside the system, and has marked it so. |
| `HELD` | Payment is deliberately withheld — a dispute, a compliance question, an unverified guardian. |
| `DISPUTED` | The amount or the entitlement is contested. |

Each earning records the amount, the currency, the campaign and deliverable it
arises from, the status, and who changed that status and when.

## 3 · What SponsorX does not store

The following are **out of scope for Phase 1 and must not be added to the
platform without replacing this policy**:

- **Tax identification of any kind** — no SSN, no ITIN, no EIN, no W-9 or W-8
  data, whether typed, uploaded or attached.
- **Bank account or card details** — no account numbers, no routing numbers, no
  payment-provider credentials.
- **Any instruction that causes money to move.** SponsorX never initiates,
  schedules or authorises a payment.

`PAID` is a statement about something that already happened elsewhere. It is a
bookkeeping mark, not an instruction.

## 4 · Why

Phase 1 runs a small pilot cohort with BTG staff in the loop on every campaign.
Collecting tax identification would create a regulated data store — with
retention, encryption, access-control and breach-notification obligations —
before there is any payout automation that needs it, and while a meaningful
share of the athletes are minors. The obligation would be real from the first
record; the benefit would not arrive until Phase 2.

Not collecting it is therefore the smaller risk, not merely the cheaper option.

## 5 · What this means in practice

**For BTG staff.** Pay athletes as you do today. When a payment has been made,
mark the earning `PAID` in the finance workspace. If a payment must wait, use
`HELD` and record why, rather than leaving it `APPROVED_FOR_PAYOUT`.

**For engineering.** No model, form, import or integration may introduce a tax
ID or bank detail field. A task that appears to require one is blocked and must
be raised, not worked around. This applies to data arriving from Zoho as much as
to data typed into SponsorX.

**For athletes and guardians.** The platform shows what has been earned and its
status. It does not ask for bank details or tax information, and it is not where
payment is set up.

## 6 · The one thing still to confirm

Whether anything in the current manual payout process pushes a tax ID into the
platform anyway — an emailed W-9 attached to a record, a spreadsheet imported
with an identifier column, a note field used as a workaround. If it does, that
route must be closed rather than the policy widened.

*Confirmed by the signer below.*

## 7 · When this policy must be replaced

Any one of the following ends Phase 1 treatment and requires a new, signed
policy **before** the work starts:

- SponsorX begins moving money, scheduling payouts or holding balances.
- Payout accounts are stored in the platform (Phase 2, §32).
- BTG becomes obliged to issue tax forms on the basis of platform records.
- Earnings volume or athlete count reaches a level where manual payment is no
  longer the actual process.

---

## Signature

This policy is in force for Phase 1 once signed by the person responsible for
athlete payouts.

| | |
|---|---|
| **Name** | |
| **Role** | Responsible for athlete payouts |
| **Signature** | |
| **Date** | |

**Confirming, by signing:** that Phase 1 tracks earnings status only; that no
tax identification or bank detail is collected by the platform; that money moves
outside SponsorX; and that §6 above has been checked against the manual process
as it is actually run.

---

*References: Blueprint §37 (gate one), §21 (state machines), §11, §26, §27;
`.claude/stack-decision.md` Addendum A6. Implements task `P0-PMO-01`; unblocks
`P7-BE-01` (earnings model and state machine).*
