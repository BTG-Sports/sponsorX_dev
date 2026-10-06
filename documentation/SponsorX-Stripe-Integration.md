# SponsorX — Stripe integration (2S5-INT-01, 2S5-INT-03)

Stripe is SponsorX's payment provider (2S0-PMO-03). This page covers how money
moves, which Stripe events SponsorX listens to and what each one does, the
configuration and its boot guard, and the steps for going live.

Code: `backend/src/lib/stripe.ts` (the SDK, the webhook check, the event
mapping) behind `backend/src/lib/payment-provider.ts` (the provider-neutral
adapter). Nothing past the adapter knows Stripe exists. A test guards this:
only `lib/stripe.ts` may import the SDK. SDK: `stripe` **23.0.0** (API version
`2026-09-30.endive`).

---

## 1 · The money flow

The design is **Stripe Connect as a marketplace, with separate charges and
transfers**. The programme owner chose it.

1. **The sponsor pays BTG.** "Pay by card" opens a hosted **Checkout
   Session** (mode `payment`) on BTG's platform account. There is no
   destination charge and no `on_behalf_of`. BTG is the merchant of record and
   owns refunds and disputes. Card details go to Stripe only. Which payment
   methods appear is set in the Dashboard's payment-method settings, because
   this API version has no per-session list.
2. **SponsorX holds the money.** The payout rules decide when a payee's share
   may go out: delivery confirmed, the holding period over, no dispute, and the
   account READY (`payouts.ts`). Those rules are unchanged.
3. **SponsorX transfers each share.** A payout is a **transfer** from BTG's
   balance to the payee's connected account. Stripe then pays the payee's bank
   from that account on its own schedule.

**Payees are Accounts v2 recipients, Express-equivalent.** Stripe now refuses
v1 account creation (`POST /v1/accounts`) for new Connect platforms. The
sandbox answered "create connected accounts with POST /v2/core/accounts
instead". So SponsorX opens accounts through **Accounts v2** with these
settings:

- `dashboard: "express"`, so Stripe collects the requirements;
- `defaults.responsibilities` set to `fees_collector: application` and
  `losses_collector: application`, so BTG carries fees and losses;
- the **recipient** configuration only, with
  `stripe_balance.stripe_transfers` requested.

Payees receive transfers and never take card payments, so there is no
merchant configuration. Stripe requires a `contact_email` for a recipient.
SponsorX sends the email of the signed-in person setting the account up: the
payee, a property's manager, or a minor's guardian. It stores the
`acct_…` id and the readiness status, **and nothing else**.

**Onboarding** uses a hosted Account Link (v2, `account_onboarding`). The
return and refresh URLs both point at the payout page the person started from
(`APP_URL` + the existing `returnPath`). An account that is already READY gets
a one-time login to its Express dashboard instead.

**READY** means three things:

- the recipient's `stripe_balance.stripe_transfers` is `active` (money can be
  sent to the account);
- `stripe_balance.payouts` is `active` (the money can reach the payee's bank);
- nothing the payee must provide is currently due or past due.

Payees never have `charges_enabled`, because they don't take card payments.
So READY is "can receive transfers and be paid out", not `charges_enabled`.
Anything else is NEEDS_INFO, with Stripe's reason ("Stripe needs more
information (external_account)", "Stripe is verifying…"). If Stripe rejected
or closed the account, it is recorded as NEEDS_INFO and the event is **held
for BTG**, because the payee can't fix that themselves.

## 2 · Idempotency keys and metadata

Every Stripe write carries an idempotency key and SponsorX's own ids:

| Write | Idempotency key | Metadata |
|---|---|---|
| Checkout Session | `checkout:<attempt id>` | `attemptId`, `orderId` (on the session **and** its PaymentIntent) |
| Connected account (v2) | `account:<ATHLETE\|PROPERTY>:<payee id>` | `payeeType`, `payeeId`, `tenantId` |
| Account Link / login link | `account-link:<uuid>` / `account-login:<uuid>`. These links are single-use, so each request gets its own key. | — |
| Transfer (a payout) | `transfer:<payout id>:<hand-over n>` | `payoutId`, `handOver`; `transfer_group: payout_<id>` |
| Refund | `refund:<refund id>` | `refundDueId`, `orderId`, `attemptId` |

A key is only good for 24 hours. A retry after that could make a second
transfer or a second refund, so before writing, the adapter looks the object
up on Stripe:

- **Transfer:** it lists the payout's `transfer_group` and checks for a
  transfer with the same `handOver`.
- **Refund:** it lists the payment's refunds and checks for one carrying this
  `refundDueId`.

If one exists, it is reused.

A Checkout Session's parameters are fixed per attempt, so a network retry
carries the same key and the same parameters. Sending the same key with
different parameters is a bug, and is treated as a refusal, not as "try
again".

**Refunds go through the worker.** A card refund is a network call, so it is
never made on a request path. With Stripe:

1. The refund path writes the `RefundDue` row `OPEN`, marks it with
   `provider = stripe`, and queues `refunds.send`.
2. The worker (`refunds.ts` `sendRefund`) holds the row's lock for the whole
   call, refunds through Stripe, and marks the row `SENT` with the `re_…`
   reference.

If Finance marks the refund sent by hand at the same moment, that write waits
for the lock and then finds the row already sent. If Stripe is down, the job
throws and is retried. If Stripe refuses, the row goes back to Finance's
"Refunds to send" list and BTG's admins are emailed (`refund.providerRefused`).

**A refused payout.** A transfer Stripe refuses (for example "insufficient
funds", "account can't receive transfers") becomes a payout failure with a
failure kind. TEMPORARY is retried by the sweep. ACCOUNT waits for the payee.
OTHER goes to BTG. The kind is decided by `failureKindFor`.

## 3 · Webhooks — the endpoint, the check, the secrets

All Stripe deliveries go to **one URL**:
`POST https://<api public domain>/api/v1/webhooks/payments/stripe`.

The `Stripe-Signature` header is checked over the raw body by the SDK
(`webhooks.constructEvent`). Thin event notifications are checked with the
same verifier that `constructEvent` runs, because `constructEvent` refuses thin
payloads by design. The check is made against every accepted signing secret,
each with its `_PREVIOUS` rotation pair (`lib/rotating-secret.ts`):

| Stripe destination | Signing secret env var |
|---|---|
| Platform, snapshot payload (this account's events) | `STRIPE_WEBHOOK_SECRET` (+ `_PREVIOUS`) — **required** |
| Thin payload (Accounts v2 events) | `STRIPE_THIN_WEBHOOK_SECRET` (+ `_PREVIOUS`) — needed for payout accounts to turn READY |
| Connected accounts, snapshot payload | `STRIPE_CONNECT_WEBHOOK_SECRET` (+ `_PREVIOUS`) — optional |

A delivery is refused (401, recorded as a REJECTED `WebhookDelivery`) when:

- the signature is wrong;
- the body was altered;
- it is older than `PAYMENT_WEBHOOK_TOLERANCE_SECONDS` (default 300), which
  makes it a replay;
- it is dated further than that in the future.

Every verified event goes through the existing machinery unchanged:

- it is recorded once per Stripe event id (`PaymentEvent`), so a redelivery is
  a no-op;
- it is queued as `payments.event`;
- the worker applies it forward-only, under row locks;
- an event that names something SponsorX hasn't recorded yet is deferred and
  retried;
- anything SponsorX must not act on by itself is HELD for BTG.

Nothing is applied on the request path. Nothing calls Stripe on the request
path either: thin events carry no state, so the worker reads the account from
Stripe when it applies them.

### `enabled_events` — what the lead registers after deploy

**1 · Platform endpoint.** Payload: snapshot. Events from: your account. Secret
goes to `STRIPE_WEBHOOK_SECRET`.

```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
refund.created
refund.updated
refund.failed
charge.refunded
charge.refund.updated
charge.dispute.created
charge.dispute.closed
transfer.created
transfer.reversed
```

**2 · Accounts v2 event destination.** Payload: thin. Secret goes to
`STRIPE_THIN_WEBHOOK_SECRET`. Same URL.

```
v2.core.account.updated
v2.core.account.closed
v2.core.account[requirements].updated
v2.core.account[configuration.recipient].updated
v2.core.account[configuration.recipient].capability_status_updated
```

**3 · Connect endpoint (optional).** Payload: snapshot. Events from: connected
accounts. Secret goes to `STRIPE_CONNECT_WEBHOOK_SECRET`. Same URL.

```
account.updated
capability.updated
payout.failed
```

`payment_intent.payment_failed` is **not** needed (see §4).

## 4 · The event mapping (`lib/stripe.ts` `mapStripeEvent`)

| Stripe event | SponsorX event | Why |
|---|---|---|
| `checkout.session.completed`, `payment_status: paid` | `payment.succeeded` (attempt id, `pi_…`, `amount_total`) | the money is taken |
| `checkout.session.completed`, `payment_status: unpaid` | `payment.processing` | a method that clears later; a second "pay" is refused meanwhile |
| `checkout.session.async_payment_succeeded` / `_failed` | `payment.succeeded` / `payment.failed` | the delayed method's answer |
| `checkout.session.expired` | `payment.failed` ("the page expired — nothing was charged") | the attempt is over; the sponsor can pay again |
| `payment_intent.payment_failed` | *(acknowledged, not applied)* | On hosted Checkout a declined card is retried **on the same page**, so a decline is not the end of the attempt. Recording it as FAILED would turn every "wrong card, then the right one" into a payment held for BTG, because "succeeded after failed" is HELD. The attempt's end comes from `expired` or `async_payment_failed`. |
| `refund.created` / `refund.updated` / `charge.refund.updated` (status `succeeded`) | `payment.refunded` (`re_…`, amount, `refundDueId`) | The refund is ours by its reference, or by the `refundDueId` in its metadata even before the worker writes the reference. Otherwise it is a refund made at the provider (2S5-BE-03 rules). |
| `charge.refunded` | `payment.refunded` per refund in its list, when the list is present | in this API version the list isn't sent by default; `refund.*` carries it; duplicates are "already recorded" |
| `refund.failed`; `refund.updated` with `canceled` | `provider.notice` → **HELD** | the money did NOT go back to the card |
| `charge.dispute.created` | `dispute.opened` | the order's money freezes; BTG support reviews |
| `charge.dispute.closed` | `dispute.closed`: `won` / `warning_closed` / `prevented` give WON; `lost` gives LOST | BTG resolves it to that outcome (never the system) |
| `transfer.created` (our metadata) | `payout.paid` | **A transfer to the payee's connected account is the "paid" moment.** Separate charges and transfers: once it lands, SponsorX's obligation is met. |
| `transfer.reversed`, reversed in full | `payout.returned` | the money is back with BTG; the payout's journals are mirrored (it is the payee's again in the books) |
| `transfer.reversed`, in part | `provider.notice` → HELD | SponsorX can't split a payout's journals by itself |
| `v2.core.account…` (thin) | `account.updated` (account id only) | the worker reads the v2 account and applies READY / NEEDS_INFO; the latest read wins, so order doesn't matter |
| `account.updated` (snapshot, a v1 account) | `account.updated` with its readiness | kept for v1 accounts / compatibility |
| `capability.updated` (Connect) | `account.updated` (account id only) | the worker reads the account |
| `payout.failed` (Connect, a payee's bank payout) | `provider.notice` → HELD | Our transfer already reached their Stripe balance; the money waits there until they fix their bank. BTG's own bank payouts are ignored. |
| a Checkout session or transfer **without** SponsorX's id in metadata; anything else | *(acknowledged, nothing to apply)* | not SponsorX's |

There are two new neutral types (migration `20261006030000_stripe_provider_events`):

- `account.updated`, the payee's account at the provider;
- `provider.notice`, which is always HELD for BTG, in words.

`payout.failed` stays the provider refusing a hand-over. With Stripe that
refusal comes back synchronously from the transfer call, as described in §2.

## 5 · Configuration and the key guard

| Variable | Where | Notes |
|---|---|---|
| `PAYMENT_PROVIDER` | api | `stripe`, `standin` (staging / tests) or `none`. Unset: `none` in Railway production, `standin` elsewhere. `standin` is refused in production. |
| `STRIPE_SECRET_KEY` | api | Required with `stripe`. Never logged: every Stripe error is scrubbed of key-shaped text first. |
| `STRIPE_WEBHOOK_SECRET` | api | Required with `stripe`. |
| `STRIPE_THIN_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | api | See §3. |
| `STRIPE_PUBLISHABLE_KEY` | api, web | Not needed by hosted Checkout; not required. |
| `STRIPE_CONNECT_COUNTRY` | api | Country new payout accounts open in; default `US`. |
| `PAYMENT_PROVIDER_TIMEOUT_MS`, `PAYMENT_WEBHOOK_TOLERANCE_SECONDS` | api | Unchanged (2S8-QA-02, 2S5-INT-02). |

**The boot guard** (`config/stripe-guard.ts`, run by `config/env.ts`) refuses to
start the API in these cases:

- `PAYMENT_PROVIDER=stripe` without `STRIPE_SECRET_KEY` or
  `STRIPE_WEBHOOK_SECRET`;
- a **live** key (`sk_live_` / `rk_live_`) unless `RAILWAY_ENVIRONMENT_NAME`
  is exactly `production`. This applies whatever the provider setting, because
  a live key on staging is one flag away from moving real money;
- a **test** key in production when Stripe is the provider;
- anything that is not a Stripe secret key.

## 6 · Going live

1. **Stripe Dashboard, live mode.**
   - Finish Connect platform onboarding.
   - Set the Checkout payment methods.
   - Set the branding and the statement descriptor.
   - Confirm the Connect settings for Express-dashboard accounts (the platform
     pays fees and carries losses).
2. **Register the three destinations** from §3 in live mode, at the
   production API URL. Copy each signing secret.
3. **Set the variables in Railway production (`api`):**
   - `STRIPE_SECRET_KEY` = the live `sk_live_…` (a restricted `rk_live_…` key
     with Checkout, PaymentIntents read, Refunds, Transfers, Accounts v2 and
     Account Links is better);
   - `STRIPE_WEBHOOK_SECRET`, `STRIPE_THIN_WEBHOOK_SECRET` and
     `STRIPE_CONNECT_WEBHOOK_SECRET`;
   - only then `PAYMENT_PROVIDER=stripe`.

   Production refuses a test key, and staging refuses a live one.
4. **Deploy, then do one small real payment.** Pay $1 on a test order, check
   the order is PAID, refund it, and check the RefundDue is SENT and confirmed.
5. **Fund BTG's balance before the first payouts.** Card money is pending for
   a couple of days. A transfer before then is refused as `balance_insufficient`
   and retried by the sweep (TEMPORARY).
6. **Rotate a signing secret** with its `_PREVIOUS` pair
   (documentation/SponsorX-Secrets-Rotation.md).

## 7 · Testing

- **`tests/stripe-adapter.test.ts`** (no database, no Stripe) covers:
  - the key guard;
  - signatures: good, bad, altered, stale, future, previous-secret rotation,
    thin;
  - every mapped event;
  - readiness for v1 and v2 accounts;
  - failure kinds;
  - what each write sends: idempotency keys and metadata, through the real SDK
    and a fake HTTP client.
- **`tests/stripe-payments.test.ts`** (database, API, fake Stripe) covers:
  - pay by card, then Checkout completed, then the order is PAID;
  - duplicates and reordering;
  - an expired page;
  - asynchronous methods;
  - signatures over HTTP;
  - Stripe down when the sponsor pays;
  - a property's onboarding moving NOT_SET_UP → NEEDS_INFO → READY on thin
    events;
  - a rejected account;
  - a payout as a transfer, including a refusal, a retry, `transfer.created`
    giving PAID, and an early event;
  - refunds through the worker, including the webhook arriving before the
    worker, a refusal, and an outage;
  - disputes and notices.
- **`backend/scripts/stripe-sandbox-smoke.mts`** is a manual tool, not part of
  vitest. It runs against the real sandbox through the real adapter, then feeds
  the events Stripe actually emitted through `acceptPaymentWebhook` and
  `processPaymentEvent`. How to run it is in its header. Result on
  2026-10-06: **16/16 checks passed**.
