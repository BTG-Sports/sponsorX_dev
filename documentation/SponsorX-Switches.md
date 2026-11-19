# SponsorX — switches

Every setting that turns a SponsorX behaviour on or off, or changes how it
behaves, in one place. They are settings on the `api` service in Railway, one
set for staging and one for production. A change takes effect when the
service restarts after the variable is saved.

**Keep this current.** Whoever adds or flips a switch updates this file in the
same pull request or on the same day. The "Now" column is what the team last
recorded. Railway is the truth: check it there before relying on it.

Last reviewed: 2026-11-11 (production values read from the running `api`).

---

## 1. Go-live switches

These are the ones to watch. Each one is waiting on something outside the code.

| Switch | What it does | Default (empty) | Now: staging / production | Turn it on when |
|---|---|---|---|---|
| `PAYMENT_PROVIDER` | **The master payments switch.** `none`: nobody is charged or paid, the pay buttons say payment opens later, and approved orders wait with no deadline (POL-BE-04). `standin`: a test provider that moves no money; refused in production. `stripe`: real card payments, payouts and refunds. | `none` in production, `standin` elsewhere | `stripe` / `stripe` (production set 2026-11-03; checkout stays closed while the Payments switch below is off) | The polish list is done and BTG decides to take payments. Stripe's keys and webhook secrets must be set first (section 2). |
| **Payments switch** (BTG admin, `POL-BE-36` / `POL-FE-36`) | **BTG's own on/off, in the app** at `/admin/payments` (BTG Admin) and `/finance/payments` (Finance) (`GET`/`PUT /payments/switch`). It works at once, with no deploy. Payment is open only while `PAYMENT_PROVIDER` names a provider AND this is on. Off means no checkout, no payout sent or set up, and no order cancelled for non-payment (orders wait, then get three fresh days); webhooks still settle what is already moving. Changing it needs a reason, is audited, and records who changed it and when. Only BTG Admin and Finance can change it. It can't be turned on while `PAYMENT_PROVIDER` is `none`. Turning it on sends the payouts that waited. | off in production, on elsewhere (nothing set yet) | on / off (production: nothing set, checked 2026-11-03) | BTG is ready to take payments: first set `PAYMENT_PROVIDER=stripe` (section 2); nothing opens until BTG turns this on. |
| `REWARD_STAFF_CODE_REQUIRED` | `on`: a fan's reward is redeemed only with the reward's six-digit staff code (the booth's PIN). `off`: redeem works as before, though a code that is sent is still checked. Undo always needs the code. (POL-BE-07) | `off` | `on` / `on` (2026-11-11, rcfworks; staging tested first: no code and a wrong code refused, the right code redeems, undo works) | HeckerCreatives' fan page asks for the code (POL-FE-07). Turn on in staging first, test a redeem and an undo, then production. |
| `REWARD_FAN_CODES` | `on`: a fan claiming through an athlete's shared QR gets a code of their own, so every fan who scans it can claim and redeem, up to the reward's limit. The shared QR can't be redeemed itself. `off`: one claim per code, so only the first fan can claim a shared QR. (POL-BE-08) | `off` | `on` / `on` (2026-11-11, rcfworks; staging tested first: two claims on one shared QR got two different codes, the shared QR itself is refused) | HeckerCreatives' fan page sends the fan on to their own code after claiming (POL-FE-08). Staging first: two phones on one QR should each get their own reward. |
| `DEAL_CHAT` | `on`: every marketplace order placed goes into the Deal Chat stage (`IN_CHAT`) instead of asking its seller. There is a chat per seller, where the sponsor and the seller agree the answers and the final amount and both sign the agreement. Payment opens only after every agreement is signed. Either side can call the deal off with a reason, and an order not signed within the limit below is cancelled. `off`: today's order flow and no chat; orders already in a chat finish there. (2S4-BE-15, 2S4-BE-16) | `off` | `off` / `off` (2026-11-18, rcfworks: the order flow built in 2S4-BE-15, not yet turned on) | HeckerCreatives' Deal Chat screens are live (2S4-FE-07/08/09). Staging first: place an order, agree it, sign it on both sides, and check that Pay opens only then. |
| `DEAL_CHAT_SIGNING_WORKING_DAYS` | The Deal Chat's signing limit: the working days from placing the order within which both sides must sign. After that the order is cancelled, its stock released and both sides emailed; both get a last warning 2 working days before. A setting, 3 to 60. (2S4-BE-15) | `10` | not set / not set (default 10) | Change it only if BTG finds 10 working days too short or too long. |
| `DEAL_CHAT_SOCKET` | `on`: the API opens a live socket on `/api/v1/socket` (socket.io, WebSocket only). It tells a signed-in browser "this chat changed": a chat id and its order's id, never a message, an answer or an amount. The web app then reads the chat again the ordinary, permission-checked way, so messages, answers, offers, signatures and BTG's desk update at once instead of on the next few-second ask. A login hears about a chat only if it could read it (the socket's rooms are `whereFor(dealChat, read)`). `off`: no socket; the web app keeps asking every few seconds, as before. Needs `API_PUBLIC_URL` on the web service. (2S4-FE-07/08/09; owner, 2026-11-19) | `off` | `off` / `off` (2026-11-19, HeckerCreatives: built and walked locally, not yet turned on) | Deal Chat (`DEAL_CHAT`) is on and the API's public address is set on the web service. Staging first: open one chat in two browsers and check the "Live" mark shows and a message appears on the other side within a second. |
| `API_PUBLIC_URL` (web service) | The API's address as a **browser** reaches it, for the Deal Chat socket only. Every other call still goes from the web server to the API over the private network (`API_URL`), which is never handed to a browser. Unset: a local run uses `API_URL` when it is `localhost`; anywhere else there is no socket and the chat asks every few seconds. The API accepts the socket only from the web origins it already trusts (`CLERK_AUTHORIZED_PARTIES` / `APP_URL`). | not set | not set / not set | Set it to the API service's public `https://` address when turning `DEAL_CHAT_SOCKET` on. |
| `BTG_POSTAL_ADDRESS` | BTG's postal address in every fan email footer (CAN-SPAM) and the fan privacy notice. Empty: the line is left out. | empty | not recorded / `2601 Pennsylvania Ave, Baltimore, MD 21217` (set 2026-11-03; the address on BTG's Stripe account, confirmed by the user) | BTG supplies the address (go-live item, `P8-PMO-06`). |
| `SUPPORT_MAILBOX_READY` | `true`: pages show the support address as working. `false`: they say it is being set up. | `false` | `true` / `true` (production checked 2026-11-03) | The support mailbox is set up (`2S1-OPS-01`). Done 2026-10-07: `support@sponsorx.net` forwards to `infinex1@icarrefound.org` until Zoho Desk takes over. |
| `FACT_CHECK_EMAILS` | `on`: the nightly figures check emails BTG's admins when the figures don't match. It runs and records its result either way. | `off` | not recorded / `on` (2026-11-03; production has no campaigns yet, so nothing old to mismatch) | That environment's history of figures is filled (`3S1-OPS-04`). Before then every old campaign shows as "not matching". |
| `FORECAST_EMAILS` | `on`: BTG admins and campaign managers are emailed when a live campaign becomes at risk, and when it recovers. The dashboard alert shows either way. | `off` | not recorded / `on` (2026-11-03) | BTG wants the emails. |

**Built (`POL-BE-36`, 2026-10-30):** the Payments switch above. `PAYMENT_PROVIDER`
stays the master off: the admin switch can only turn payments on where the
provider is set up. To open payments in production:
1. set `PAYMENT_PROVIDER=stripe` in Railway (the keys in section 2 must be there,
   or the service won't start);
2. turn the Payments switch on at `/admin/payments` (or `/finance/payments`), with a reason.

**Built (`POL-FE-36`, 2026-11-03):** the screens for it — the Payments desk in the admin
portal and its Finance twin, each change with a reason and a confirmation, showing who
changed it, when and why, plus the history; "Turn on" is disabled with "Payment provider
not set up in Railway yet" while `PAYMENT_PROVIDER` is `none`. While payment is closed,
every pay and payout button says "Payments open soon".

Closing them again is step 2 alone.

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

Production status (2026-11-03): the live key and the three webhook secrets
are installed, and `PAYMENT_PROVIDER=stripe` (the `api` restarted healthy, which
the key guard only allows when they are). The restricted key was probed from
inside `api` with calls that cannot create anything: Checkout Sessions,
PaymentIntents, Refunds, Transfers, Accounts v2 and v2 Account Links are all
allowed. It cannot read the account itself, v1 Account Links or the webhook
list, none of which the code uses. Stripe's own account status (Dashboard,
2026-11-03): payments and payouts active, no tasks due.

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
