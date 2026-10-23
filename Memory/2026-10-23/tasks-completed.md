# 2026-10-23

## Railway use resumed; secret rotation continues (staging done for Resend and Clerk)

- **The owner resumed Railway use.** Railway's builds and deploys run normally on all plans. Its status page still says Major Outage while the incident report is pending, and it's emailing affected customers.
- **The nightly deploy ran during the pause.** `deploy-daily.yml` moved `release` to `d5537124` (sync PR #289) at 16:50 UTC on 2026-10-22, and Railway deployed **staging and production** api and web. So:
  - **Production** runs the approved legal wording, with its secrets unchanged.
  - **Staging** picked up the signing secrets staged on 2026-10-22.
  - The workflow isn't blocked by the "no Railway" decision. Pause it too next time.
- **Staging checks:** health 200; the Stripe and Zoho webhook paths answer 401 through web (P8-OPS-03 is live); COLLAB is v2 and `/public/fan-privacy` is served.
- **Resend:** new keys made (production and staging). Staging api has the new key and was redeployed. A test support message sent both emails (`support.message`, `support.copy`).
- **Clerk:** new live and test keys made. Both were accepted by Clerk's API (read-only `GET /v1/users`). The test key is on staging api, web and tester (all redeployed), on GitHub `CLERK_SECRET_KEY_TEST`, and in the local `.env`.
- **Production is still pending:** the Resend and Clerk live keys, plus the INTAKE and edge secrets. Claude's permission classifier blocks production secret writes, so the owner sets them by hand or adds a permission rule.
- **The keys file** is `~/Desktop/sponsorx-keys.txt` (chmod 600). It's deleted when the rotation is done.
- **Next:** R2, Stripe test, Zoho sandbox, the GitHub monitor token, then the database and Redis passwords.
- **Production rotated** in manual mode, where the owner approves each command. In auto mode the classifier blocks production secret writes.
  - **New values:** `RESEND_API_KEY` (api), `CLERK_SECRET_KEY` (api and web, live key), `INTAKE_TOKEN_SECRET` (api, no `_PREVIOUS`) and `SPONSORX_EDGE_KEY` (api and web, matching).
  - **Redeployed** at 04:17 UTC. The API booted cleanly (`SponsorX API listening on :4000 (production)`); sponsorx.net returns 200.
  - **Webhook paths through sponsorx.net:** the Zoho invoice and CRM paths answer 401. The Stripe path answers the API's own 404 ("no payment provider connected"), which is expected until `PAYMENT_PROVIDER=stripe` at go-live. So the P8-OPS-03 forwarding works in production.
- **Old keys are now safe to delete:** Resend (production and staging) and Clerk (live and development).
- **Cloudflare R2 rotated.** One account API token, scoped to `sponsorx-private` and `sponsorx-public`. Staging and production share both the buckets and the key, and the account also holds two `acps-staging-*` buckets that belong to something else.
  - **Tested before use:** the new key listed both buckets, and wrote and deleted a test object.
  - **Set on api** in staging and production, both redeployed (04:31 UTC).
  - **Staging checked end to end:** a support message with a 1-px PNG. The presigned PUT returned 200, and `/send` returned 200, so the server found the object with the new key.
  - **Production:** the API booted cleanly.
  - The R2 dashboard deep link `?to=/:account/r2/api-tokens` lands on the plans page; the direct link is `/<accountId>/r2/api-tokens`.
  - **The old R2 token is now safe to delete.**
- **Stripe sandbox (staging, "BTG sandbox" `acct_1UNCvFKA9GZ8RRgK`) rotated.**
  - **New on staging api, redeployed 08:19 UTC:** `STRIPE_SECRET_KEY` (checked as that account's key), plus `STRIPE_WEBHOOK_SECRET` (platform, snapshot endpoint `we_1UNPhwKA9GZ8RRgKLWZ30ogs`) and `STRIPE_THIN_WEBHOOK_SECRET` (accounts v2 destination `ed_test_61VWnf…`).
  - **Webhook check:** a message self-signed with each new secret gets 202, and a wrong secret gets 401.
  - **Side effect:** the thin check recorded an `account.updated` event for a made-up account, `acct_test_rotation`, on staging. It's a test record.
  - **Mix-up:** the dashboard showed two sandboxes. The user first rolled the secret key in a **different** sandbox ("BTG", `acct_1UNCupGfl3hcz7a8`, publishable key ending `2l3ebxWP`). No SponsorX environment uses it (staging uses `pk_test_…5hSr`; local .env has no Stripe key), so letting that old key expire is harmless.
  - **The restricted smoke-test key** (`rk_test_…2oCb`) was rolled too; its new value hasn't been copied yet. `STRIPE_SECRET_KEY_RESTRICTED_TEST` stops working when the old one expires.
- **`STRIPE_SECRET_KEY_RESTRICTED_TEST` deleted from staging api** (owner's choice). `scripts/stripe-sandbox-smoke.mts` never read it; it uses `STRIPE_SECRET_KEY`. Nothing redeployed, since the variable was unused.
