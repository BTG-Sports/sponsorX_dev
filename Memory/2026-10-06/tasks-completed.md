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
