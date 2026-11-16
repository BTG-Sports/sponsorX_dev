# Testing SponsorX on staging

What a tester needs to know before testing staging. Added for POL-74 (app review, 2026-11-15).

## Staff accounts come from the Tester Facility

SponsorX has no screen for adding BTG staff or changing their roles. Staff sign in with accounts the Tester Facility creates, and the Facility runs on staging only.

- The Facility offers five staff roles: BTG admin, network manager, campaign manager, Finance and Sales. It also creates sponsor, athlete, guardian and property accounts.
- Use one account per role you want to test. A person with two roles (for example Finance and BTG admin) lands in Admin, the more senior workspace, and never sees the Finance portal.
- To change a staff account's role, make a new account in the Facility with the role you need. An account's role can't be changed in SponsorX.
- A staff desk inside SponsorX is later work, not part of the polish list.

## Desks that stay empty unless you fill them

Some desks only fill when a payment provider sends events. Staging has no real provider, so these desks look empty until you create events:

| Desk | How to fill it on staging |
|---|---|
| Finance → Disputes | As a BTG admin, call `POST /api/v1/payment-events/test-provider` with `type: "dispute.opened"` and the `orderId` of an order paid by card. Send `dispute.closed` with `outcome` to settle it. |
| Finance → Payment events | Use the same call with any `payment.*` or `payout.*` event type, sent up to three times and in any order. Events the queue can't apply land on this desk. |
| Payouts → Failed | Use the same call with `type: "payout.failed"`, a `payoutId` and a `kind` (`TEMPORARY`, `ACCOUNT` or `OTHER`). |

The call returns 400 on any environment where the stand-in provider is off. That includes production.

## Things that are true on staging but not in production

- **Zoho.** When staging has no Zoho CRM credentials, the system board shows Zoho as "Not connected". Syncs wait and go out once credentials are set. The worker queue's health doesn't count those waiting syncs.
- **Payments.** While card payment is closed, approved orders read "Approved" and approved payouts say why they're waiting. Nothing is charged or sent.
- **Intelligence.** Pricing and Forecasts fill in during the nightly run, which starts at 19:00 UTC. A new item or campaign shows up after the next run.
