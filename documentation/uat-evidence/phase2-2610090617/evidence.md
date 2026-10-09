# Phase 2 UAT on staging · run 2610090617

Simulated people who signed up through the normal pages (2S8-PMO-01). Web https://web-staging-904a.up.railway.app.

| Step | Who | What | Expected | Result | Criteria |
| --- | --- | --- | --- | --- | --- |
| 1 | Team | Apply at /onboarding and click the email link | Approved automatically, or held with a reason; sign-in works | PASS — approved automatically; property cmv0kqo33006k0cqjh5ell8kl | 1 |
| 2 | BTG admin | Open the new organisation on the sign-ups desk | It is there with its checks; Reject and Reinstate are available | PASS — the organisation is on BTG's desk | 1 |
| 3 | Athlete | Apply at /join with a government ID and click the email link | Approved and active with no BTG step | PASS — approved and ACTIVE automatically; athlete cmv0kqxma006v0cqj7sejqb1y | 1 |
| 4 | Team, athlete | Team invites the athlete at a 20% share; athlete accepts | Athlete is on the roster at that share | PASS — the athlete is on the team's roster at 20% | 9 |
| 5 | Sponsors | Fill in the sponsor request (/brief), upload proof, confirm email — twice | Each sponsor account opens automatically | PASS — both sponsor accounts opened automatically | — |
| 6 | Team, athlete | Set up payouts on Stripe; try Request payout before it is READY | Refused with the reason until READY, then READY | PASS — both refused before set-up, then READY from Stripe's webhook | 10 |
| 7 | Athlete, team | Athlete adds an item; team lists it once with a restricted word, then clean | First held for BTG with the word named; the clean one goes live | PASS — held with "casino" named; once edited, published automatically | 2 |
| 8 | Sponsor A | Search the marketplace | Sees the team's live listing; not held listings or those its category is barred from | PASS — live clinic shown; the held listing and the one barring restaurants are not | 3 |
| 9 | Sponsor B, sponsor A | B holds the last unit and an exclusive date; A tries the same; the hold expires after 15 minutes | A refused while held; the stock comes back when the hold expires | PASS — refused while held; released on expiry and bought by A | 4 |
| 10 | Sponsor A | Try an exclusive item on overlapping dates, and an item barred to its category | Refused with the reason | PASS — both refused with the reason | 5 |
| 11 | Sponsor A | Accept the order terms, place the order, pay: card 0002, then 0077 | Approved within the spending limit; decline shown; then Paid ✓; receipt reaches the billing contact | PASS — SX-OA44ZADS approved automatically and paid on Stripe; receipt delivered to the billing contact | 6, 7 |
| 12 | BTG admin | Find the order in Zoho CRM sandbox SponsorX-Dev | Sponsor Account and Contact, team's Partner Account and manager Contact, linked Deal | PASS — pushed to Zoho — the records are checked in the SponsorX-Dev sandbox by id (see evidence.ids.zoho) | 13 |
| 13 | BTG admin | Edit a commission rule, then reopen the order's split | The order's split is unchanged; only new orders use the new rule | PASS — the split frozen at contract time did not change; the rule was restored | 8 |
| 14 | Athlete, sponsor A | Athlete marks delivered; sponsor confirms | Earnings show for the athlete and the team | PASS — delivered and confirmed; both have earnings to request | 9 |
| 15 | Athlete, team | Request payout after the sponsor confirms | Approved automatically (under $2,000), sent by Stripe transfer, Paid | PASS — approved automatically and paid by Stripe transfer: ATHLETE $434.02 tr_1UOYJrKA9GZ8RRgKdFIIEdPe; PROPERTY $108.50 tr_1UOYJtKA9GZ8RRgKV0Wi39bU | 10 |
| 15a | Athlete | Request payout before the sponsor confirms | Refused | PASS — refused — "Nothing is ready to pay out yet." | 10 |
| 16 | Team, Finance | Team opens its Earnings page; compared with the ledger and the order's split | Booked, paid, reserve and balance match the ledger to the cent | PASS — booked $120.83 = the split's team share; paid $108.50; reserve $12.33; balance $12.33; page and ledger agree | 12 |
| 17 | Each person | Open another tenant's or another person's order, hold, listing and payout | Refused every time | PASS — refused all 7: sponsor B → sponsor A's order 403; sponsor B → sponsor A's payment 403; sponsor A → sponsor B's hold 403; sponsor A → the athlete's payout 403; sponsor A → a team ledger 403; athlete → the team's payout 403; team → another property's listing 403 | 14 |

## Reviewer notes

- Step 2: the screenshot (step2-admin-desk.png) shows BTG's desk offering Suspend and Reject for the new team, with the five approval checks passed. The script's button lookup missed them by name; the desk itself is correct.
- Step 11: card 4000 0000 0000 0002 was declined on Stripe's own page, so the session stayed open and SponsorX received no event for it (Checkout does not report an in-page decline). Card 4000 0000 0000 0077 then paid; the one PaymentAttempt is SUCCEEDED with pi_3UOYBEKA9GZ8RRgK00XPlbct.
- Step 12: the five Zoho records were read back from staging's Zoho org (type: sandbox, org 7554807000000020005) on 2026-10-09: Accounts 7554807000013049001 (Harborview Bakery, Customer) and 7554807000013054002 (Chesapeake Ospreys, Partner, MD, SponsorX_ID property:cmv0kqo33006k0cqjh5ell8kl); Contacts 7554807000013050001 (Dana Brooks, under the bakery) and 7554807000013049003 (Jordan Reyes, under the team, SponsorX_ID user:cmv0kqo33006l0cqjje5qiw9h); Deal 7554807000013055001 (mkt-order:cmv0mkcy000d30cqjoa44zads, $800, Closed Won, contact Dana Brooks, both lines naming the team's Account 7554807000013054002).
- Steps 1–6 ran in the first attempt; the run was resumed twice (UAT_RESUME) after two script faults, with the same people and order — nothing was redone.

## Ids

```json
{
  "people": {
    "team": "uat.team.2610090617+clerk_test@example.com",
    "athlete": "uat.athlete.2610090617+clerk_test@example.com",
    "sponsor": "uat.sponsor.2610090617+clerk_test@example.com",
    "sponsor2": "uat.sponsor2.2610090617+clerk_test@example.com",
    "billing": "delivered+uat-2610090617@resend.dev",
    "admin": "btg.admin+clerk_test@example.com",
    "finance": "btg.finance+clerk_test@example.com"
  },
  "ids": {
    "onboardingId": "cmv0kqa0x00650cqjmwyt7lg1",
    "propertyId": "cmv0kqo33006k0cqjh5ell8kl",
    "athleteId": "cmv0kqxma006v0cqj7sejqb1y",
    "sponsorA": "cmv0krf4g007k0cqjkz3hbdts",
    "sponsorB": "cmv0krqy400860cqjym8y5z7e",
    "itemA": "cmv0m03px00ba0cqjryciwcw4",
    "listingA": "cmv0m07zp00bc0cqj1np5wwb8",
    "itemB": "cmv0m0fno00bp0cqj9vrxam3f",
    "itemC": "cmv0m0fw500br0cqj6vpoqc74",
    "itemD": "cmv0m0g4i00bt0cqjtpe2fgi2",
    "itemE": "cmv0m0gcz00bv0cqji18q7ycs",
    "listingB": "cmv0m0gm000bx0cqjkaplnonj",
    "listingC": "cmv0m0h4q00c10cqjid0gxiq9",
    "listingD": "cmv0m0hlx00c50cqj2sn8xbly",
    "listingE": "cmv0m0i3s00c90cqjhmo19la6",
    "holdB": "cmv0m0k8o00co0cqjix3ri6xm",
    "orderId": "cmv0mkcy000d30cqjoa44zads",
    "orderRef": "SX-OA44ZADS",
    "paymentIntent": "pi_3UOYBEKA9GZ8RRgK00XPlbct",
    "zoho": {
      "sponsorAccount": "7554807000013049001",
      "sponsorContact": "7554807000013050001",
      "sponsorContactSponsorxId": "cmv0krf4h007l0cqjkacvhgs7",
      "teamAccount": "7554807000013054002",
      "teamContact": "7554807000013049003",
      "deal": "7554807000013055001",
      "dealSponsorxId": "mkt-order:cmv0mkcy000d30cqjoa44zads",
      "teamSponsorxId": "property:cmv0kqo33006k0cqjh5ell8kl",
      "sponsorSponsorxId": "cmv0krf4g007k0cqjkz3hbdts"
    },
    "transfers": [
      {
        "payee": "ATHLETE",
        "amount": "$434.02",
        "transfer": "tr_1UOYJrKA9GZ8RRgKdFIIEdPe",
        "auto": true
      },
      {
        "payee": "PROPERTY",
        "amount": "$108.50",
        "transfer": "tr_1UOYJtKA9GZ8RRgKV0Wi39bU",
        "auto": true
      }
    ]
  }
}
```
