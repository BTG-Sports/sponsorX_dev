# 2026-10-06

- **2S0-PMO-03 · Done: Stripe is the payment provider** (the owner's decision).
  - BTG's Stripe account has a sandbox, "BTG sandbox" (`acct_1UNCvFKA9GZ8RRgK`). Connect is set up there as a **marketplace**: SponsorX collects payments and pays recipients.
  - The sandbox keys went from the owner's clipboard straight into Railway staging, never into chat:
    - `STRIPE_SECRET_KEY` (sk_test, on `api`);
    - `STRIPE_PUBLISHABLE_KEY` (pk_test, on `api` and `web`).
  - The variables were set with `--skip-deploys`, so they take effect on the next deploy. **Production has no Stripe keys,** and `PAYMENT_PROVIDER` stays `none` there.
- **2S0-SEC-01 is Ready.** Its only dependency was 2S0-PMO-03.
- **2S5-INT-01 and 2S5-INT-03 are In progress.** The design:
  - Stripe Checkout, hosted;
  - separate charges and transfers;
  - Express connected accounts through Account Links;
  - the Stripe webhook mapped onto the provider-neutral payment events built on 2026-10-05.
- **New dependency:** the official `stripe` npm package (owner approved).
- **Stripe went live on staging** (PRs #158 and #159, deployed from `main` 499e0b5). The registered webhooks:
  - a platform webhook, `we_1UNPhwKA9GZ8RRgKLWZ30ogs`;
  - an Accounts v2 thin destination, `ed_test_61VWnfIrbv0HeT0L416VWasbA4SQ7QET7g67jFMIqUMq`.

  Both were registered from inside the staging container. Their secrets went straight into Railway (`STRIPE_WEBHOOK_SECRET`, `STRIPE_THIN_WEBHOOK_SECRET`), and `PAYMENT_PROVIDER=stripe` is set on staging only.
  - **Gotcha:** changing a Railway variable without `--skip-deploys` rebuilds from the `release` branch, which is old code, and the build fails. Always follow it with `npm run deploy staging`.
- **2S5-INT-01 · Done.** A real purchase on staging, with the test sponsor "Stripe Test Coffee":
  - the order was $1,000 (SX-BK6HZ86G);
  - declined card 0002 was refused, then 4242 paid on `checkout.stripe.com`;
  - SponsorX showed "Paid ✓" within two seconds of the webhook, with PaymentIntent `pi_3UNQsiKA9GZ8RRgK1bwYh0FH`, and the split was exact.
- **2S5-INT-03 · In progress.** On staging, the onboarding link opens and NEEDS_INFO is recorded. Stripe's hosted onboarding shows an hCaptcha to automated browsers, so a person must finish the test onboarding for "Stripe Test Hawks" to reach READY.
- **Fix 7105256:** account events for accounts SponsorX didn't open are now ignored, not retried onto BTG's exceptions list.
- **Staging test data left in place:**
  - the "Stripe Test" admin, team, athlete and sponsor, created through the tester facility;
  - five global commission rules (15% / 5% / 2.9%+30¢ / 2% / 10% reserve) on `/admin/commission`.
- **Stripe settings worth a look:** Checkout first showed Philippine pesos (Stripe guesses the currency from location). Adaptive Pricing can be turned off in Stripe's settings.
- **2S5-INT-03 · Done.** The owner completed Stripe's hosted onboarding by hand for the test team "Stripe Test Hawks" (account `acct_1UNQnWKA9GFzKcrb`, test bank ••••6789). Stripe shows transfers and payouts as active. SponsorX turned the account **READY** on its own, from the thin webhook, at 07:54:46 UTC.
  - Only "eventually due" items remain (date of birth and the last 4 of the SSN), and they don't block payouts.
  - **Stripe's onboarding shows an hCaptcha to automated browsers,** so a person has to finish any onboarding test.
- **BTG's live Stripe account (`acct_1UNCupGfl3hcz7a8`) is activated,** checked by the owner in the dashboard on 2026-10-06.
  - Settings → Business → Account status shows **Payments** and **Payouts** active, with no open tasks.
  - Paused, and unused by SponsorX: Affirm, Cartes Bancaires, Cash App Pay, Scalapay, and the optional "Verified" badge.
  - **Connect is enabled on live,** with 0 connected accounts. Confirm its business model is "collect payments and pay recipients" at go-live.
  - No live secret key exists yet. Creating one is a go-live step: keys go into Railway production, live webhooks are registered, and `PAYMENT_PROVIDER=stripe` is set on production.
- **The Stripe CLI** (1.53.0, checksum verified) is installed at `~/.local/bin/stripe`. Browser login shows "CLI disabled" on every BTG environment even though the owner is a Developer, so it's likely an account-owner setting. When needed, use the CLI with the sandbox key read from Railway.
- **Live Stripe keys are in Railway production,** taken from the owner's clipboard and never shown. The variables were set with `--skip-deploys`.
  - `STRIPE_SECRET_KEY` (`sk_live_…QUac`, on `api`). It is named "SponsorX production" in Stripe and was created with **full access**, because the Accounts v2 permission mapping for restricted keys was unclear.
  - `STRIPE_PUBLISHABLE_KEY` (`pk_live_…2Ih2`, on `api` and `web`).
- **Production still takes no payments.** `PAYMENT_PROVIDER` is unset there (which means `none`), and no live webhooks are registered yet.
- **Go-live, when the owner decides:**
  1. Register the live platform webhook and the thin destination from inside the production container.
  2. Store their secrets in Railway production.
  3. Set `PAYMENT_PROVIDER=stripe`, then run `npm run deploy production`. A variable change alone rebuilds from `release`.
  4. Run one small real payment and refund.
- **New row: 2S8-SEC-06** (Ready). Swap the full-access live key for a restricted one, proven in the sandbox first.
- **2S0-SEC-01 · Done.** The payments and personal-data review is in `documentation/SponsorX-Payments-PII-Review-2026-10.md`.
  - **Card data passes.** Checkout is hosted, and stored payment events keep only ids and amounts. Refused webhooks no longer store the raw Stripe event; migration `20261006043000` cleaned up the rows already stored.
  - **Payout account data passes.** Only the account id and its status are stored.
  - **Verification documents pass.** They live in the private bucket and are read through audited five-minute links. A new boot guard stops the API starting if the public and private buckets are the same.
  - **Logs are fixed.** `logError` / `redactForLog` now cover every `console.error`, and Stripe's `scrub` masks emails.
  - **The owner decided the open findings on 2026-10-06:**
    - O1 fixed: support files are reached by link, not emailed; new BTG-admin routes `/support-messages/:id`;
    - O2 fixed: support attachments are deleted after 90 days (30 if the message was never sent);
    - O4 fixed: Zoho bodies are trimmed to ids after 90 days;
    - O5 fixed: card numbers are refused in payment notes;
    - O3 (third-party error text) and O6 (dates of birth are needed) accepted in writing.
  - Backend tests now total 2910.
- **New rows:**
  - **2S1-FE-14** (Ready): the admin support-message page, for HeckerCreatives.
  - **2S8-QA-08** (Ready): `private-upload-pins` fails in about 1 of 6 full parallel runs.
- **2S8-SEC-06 is in progress.** The restricted sandbox key `rk_test_…2oCb` is stored on staging as `STRIPE_SECRET_KEY_RESTRICTED_TEST`. The smoke run passed 17/17 with the app's calls on that key alone. The key was refused on `customers.list` and `balance.retrieve`, but `payouts` is allowed: BTG's own payouts come bundled with a required permission, and the money can only go to BTG's verified bank.
  - **The permissions:** Charges and Refunds W, Accounts v2 R, Recipient Configuration W, Checkout Sessions W, Account Links W, Login Links W, Transfers W, with every "in connected accounts" column None.
  - **Waiting on the owner** for the live restricted key.
- **The smoke script** (`backend/scripts/stripe-sandbox-smoke.mts`) now takes `STRIPE_SMOKE_ADMIN_KEY` for its own setup calls and `STRIPE_SMOKE_LOGIN_ACCOUNT`, which adds check 2c.
- **Go-live webhooks:** register them in the Dashboard, not through the API, so the runtime key needs no webhook-endpoint permission.
- **2S8-SEC-06 · Done.**
  - The owner created the live restricted key "SponsorX production (restricted)" (`rk_live_…QVaC`) with the seven permissions proven in the sandbox, and it is swapped into Railway production `api`.
  - A read-only check confirmed v2 accounts, refunds and transfers are allowed, while customers and balance are refused (403).
  - The owner expired the full-access key `sk_live_…QUac`.
  - Production still has `PAYMENT_PROVIDER` unset (`none`). Go-live is deferred, owner's call: possibly after Phase 4.
  - Staging still uses the full sandbox key, `sk_test_…a2Wh`. The restricted sandbox key is kept as `STRIPE_SECRET_KEY_RESTRICTED_TEST` for smoke runs.
- **2S8-QA-08 · Done.** `private-upload-pins.test.ts` now gives every id, slug and email a per-run random suffix, and its cleanup warns which tables it couldn't clear. The full backend suite passed 5 runs in a row (180 files, 2910 tests each).
