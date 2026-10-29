# SponsorX — switches

Every setting that turns a SponsorX behaviour on or off, or changes how it
behaves, in one place. They are settings on the `api` service in Railway, one
set for staging and one for production. A change takes effect when the
service restarts after the variable is saved.

**Keep this current.** Whoever adds or flips a switch updates this file in the
same pull request or on the same day. The "Now" column is what the team last
recorded. Railway is the truth: check it there before relying on it.

Last reviewed: 2026-10-29.

---

## 1. Go-live switches

These are the ones to watch. Each one is waiting on something outside the code.

| Switch | What it does | Default (empty) | Now: staging / production | Turn it on when |
|---|---|---|---|---|
| `PAYMENT_PROVIDER` | **The master payments switch.** `none`: nobody is charged or paid, the pay buttons say payment opens later, and approved orders wait with no deadline (POL-BE-04). `standin`: a test provider that moves no money; refused in production. `stripe`: real card payments, payouts and refunds. | `none` in production, `standin` elsewhere | `standin` / `none` (set 2026-10-28) | The polish list is done and BTG decides to take payments. Stripe's keys and webhook secrets must be set first (section 2). |
| `REWARD_STAFF_CODE_REQUIRED` | `on`: a fan's reward is redeemed only with the reward's six-digit staff code (the booth's PIN). `off`: redeem works as before, though a code that is sent is still checked. Undo always needs the code. (POL-BE-07) | `off` | `off` / `off` | HeckerCreatives' fan page asks for the code (POL-FE-07). Turn on in staging first, test a redeem and an undo, then production. |
| `BTG_POSTAL_ADDRESS` | BTG's postal address in every fan email footer (CAN-SPAM) and the fan privacy notice. Empty: the line is left out. | empty | not recorded | BTG supplies the address (go-live item, `P8-PMO-06`). |
| `SUPPORT_MAILBOX_READY` | `true`: pages show the support address as working. `false`: they say it is being set up. | `false` | not recorded | The support mailbox is set up (`2S1-OPS-01`). |
| `FACT_CHECK_EMAILS` | `on`: the nightly figures check emails BTG's admins when the figures don't match. It runs and records its result either way. | `off` | not recorded | That environment's history of figures is filled (`3S1-OPS-04`). Before then every old campaign shows as "not matching". |
| `FORECAST_EMAILS` | `on`: BTG admins and campaign managers are emailed when a live campaign becomes at risk, and when it recovers. The dashboard alert shows either way. | `off` | not recorded | BTG wants the emails. |

**Planned:** a Payments on/off switch inside BTG admin (`POL-BE-36`), so BTG
can stop payments at once without a deploy. When it is built,
`PAYMENT_PROVIDER` stays the master: the admin switch can only turn payments
on where the provider is set up.

---

## 2. Payments: what `stripe` needs

These must all be set before `PAYMENT_PROVIDER=stripe`. The service refuses to
start with a live key outside production, or a test key inside it.

| Setting | What it is |
|---|---|
| `STRIPE_SECRET_KEY` | The restricted key. A live key in production only. |
| `STRIPE_WEBHOOK_SECRET` | Signs Stripe's platform events: checkout, refunds, disputes, transfers. |
| `STRIPE_THIN_WEBHOOK_SECRET` | Signs payees' account changes. Without it a payee's payout account never turns ready. |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signs events on payees' accounts (capabilities, failed payouts). |
| `STRIPE_PUBLISHABLE_KEY` | Not needed by hosted checkout; set for completeness. |
| `STRIPE_CONNECT_COUNTRY` | Country new payout accounts open in. Default `US`. |

Each secret also has a `…_PREVIOUS` partner, used only while rotating it.

Production status (2026-10-28): the live key and the three webhook secrets
are installed, with `PAYMENT_PROVIDER=none`.

---

## 3. Money rules

Numbers, not on/off, but each one changes what sponsors and payees see.

| Setting | What it does | Default |
|---|---|---|
| `MARKETPLACE_BUYER_FEE_BPS` | The buyer's fee on marketplace orders, in hundredths of a percent (300 = 3%). Shown in the total before placing (POL-BE-05). | `0` (no fee) |
| `MARKETPLACE_SPENDING_LIMIT_START_CENTS` | A new sponsor's spending limit. Orders within it are approved automatically. | `500000` ($5,000) |
| `MARKETPLACE_SPENDING_LIMIT_CAP_CENTS` | The most a sponsor's limit can grow to. | `2500000` ($25,000) |
| `PAYOUT_HOLD_DAYS` | Days after an order is fulfilled before its money can be requested as a payout. | `0` |
| `PAYOUT_AUTO_APPROVE_LIMIT_CENTS` | A payout under this is approved automatically when every check passes. | `200000` ($2,000) |
| `PAYOUT_AUTO_APPROVE_WINDOW_DAYS` / `…_WINDOW_CAP_CENTS` | One payee's automatic approvals within this many days stop at this total. | `7` days / `500000` ($5,000) |
| `PAYOUT_ACCOUNT_CHANGE_REVIEW_DAYS` | After a payee's payout account changes, their payouts go to BTG for this many days. | `7` |

---

## 4. Staging only: testing switches

These make the test provider misbehave so failures can be tried. **They must
be empty in production.**

| Setting | What it does |
|---|---|
| `STANDIN_OUTAGE` | The test provider pretends to be down: `checkout`, `payout` and/or `refund`, each optionally `:timeout`. |
| `STANDIN_PAYOUT_FAILURE` | The test provider fails every payout: `TEMPORARY`, `ACCOUNT` or `OTHER`. |

---

## 5. Other settings that change behaviour

| Setting | What it does | Empty means |
|---|---|---|
| `RESEND_API_KEY` | Sends email. | No email goes out; the email jobs fail and retry. |
| `SPONSORX_EDGE_KEY` | Lets the web server pass on a fan's real address, for rate limits and city counts. Same value on `web` and `api`. | Forwarded addresses are ignored. |
| `COHORT_IMPORT_APPROVED_SHA256` | Which pilot cohort files may be imported in production, after running cleanly on staging. | No cohort import runs in production. |
| `INFINEX_SIGNING_SECRET` | Lets an INFINEX game session start. The game is parked. | No game session can start. |
| `GEOLITE2_CITY_PATH` | The city database for fan scans. | Scans have no city or region. |

Connection settings (database, storage, Clerk, Zoho, URLs) are not switches
and are not listed. They are described in `backend/src/config/env.ts`.
