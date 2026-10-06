# SponsorX Secrets Rotation Runbook

**Task:** 2S8-SEC-02 · **Written:** 2026-10-05 · **Companion:** [SponsorX-Security-Review-2026-10.md](SponsorX-Security-Review-2026-10.md)

This lists every secret SponsorX uses: where it lives, who owns it, how to rotate it on Railway step by step, and whether rotating it causes downtime.

**No secret has been rotated as part of this task.** Rotation is the owner's step. Do it on **staging first**, check it, then repeat on production.

## When to rotate

- **Straight away**, whenever a value may have leaked: pasted into chat, a ticket, a screenshot or a commit; a laptop lost; a person with access leaves. Rotate before you investigate.
- **On a schedule.** Every 12 months for the long-lived keys (Clerk, R2, Zoho, Resend, the database). Every 6 months for the signing secrets (`INTAKE_TOKEN_SECRET`, the webhook secrets, the edge key).
- **Whenever `npm run secrets:scan` fails on a real hit.** Rotate first, then remove the value from the code. A secret that was committed is still in git history.

## Zero-downtime rotation: the `_PREVIOUS` overlap

Some secrets **check** something that arrives from outside: a Zoho webhook signature, a Zoho callback token, a link already in someone's inbox, or the web server's edge key. Those cannot be swapped in one step, because for a while the other side still sends the old value. Each of them has a `_PREVIOUS` companion variable:

1. **Overlap.** Set `X_PREVIOUS` to the **current** value and `X` to the **new** one, then deploy. Both are now accepted. Anything SponsorX *signs* from now on uses the new value only.
2. **Move the other side.** Update Zoho or the web service, or wait until the old links are no longer needed.
3. **Close.** Delete `X_PREVIOUS` and deploy. The old value is refused from then on.

`X_PREVIOUS` may hold a comma-separated list, in case two rotations overlap. The code is in `backend/src/lib/rotating-secret.ts`. `backend/tests/security-review.test.ts` proves that both values are accepted during the overlap and that the old one is refused once `_PREVIOUS` is deleted.

| Variable | `_PREVIOUS` companion | What checks it |
|---|---|---|
| `ZOHO_WEBHOOK_SECRET` | `ZOHO_WEBHOOK_SECRET_PREVIOUS` | the invoice webhook HMAC (`routes/v1/zoho-webhooks.ts`) |
| `ZOHO_NOTIFY_TOKEN` | `ZOHO_NOTIFY_TOKEN_PREVIOUS` | the CRM callback channel token (same file) |
| `SPONSORX_EDGE_KEY` | `SPONSORX_EDGE_KEY_PREVIOUS` | the web → API forwarded fan address (`lib/client-ip.ts`) |
| `INTAKE_TOKEN_SECRET` | `INTAKE_TOKEN_SECRET_PREVIOUS` | every emailed link (`lib/intake-secret.ts`) |
| `STANDIN_PROVIDER_SECRET` | `STANDIN_PROVIDER_SECRET_PREVIOUS` | staging's test-provider links (`lib/payment-provider.ts`) |
| `STRIPE_WEBHOOK_SECRET` | `STRIPE_WEBHOOK_SECRET_PREVIOUS` | Stripe's platform webhook signature (`lib/stripe.ts`) |
| `STRIPE_THIN_WEBHOOK_SECRET` | `STRIPE_THIN_WEBHOOK_SECRET_PREVIOUS` | Stripe's thin-event (Accounts v2) destination signature (same file) |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `STRIPE_CONNECT_WEBHOOK_SECRET_PREVIOUS` | Stripe's Connect webhook signature (same file) |

## How to change a variable on Railway

The same steps apply to every row below:

1. Railway → project **SponsorX** → choose the **environment** (staging first) → the **service** → **Variables**.
2. Edit or add the variable.
   - If it is a **shared variable** (project → Settings → Shared Variables), change it there, so every service that references it picks it up.
   - Never paste a value into a commit, a ticket or chat.
3. Railway stages the change. Click **Deploy** (or "Apply changes") to redeploy the services affected.
4. Check:
   - `GET /health` on `api` and `web`;
   - the worker log for one drain cycle;
   - anything named in that secret's own "check" step below.

**Generating a value:** `openssl rand -base64 48` gives 48 random bytes. The secret-scan tool never flags a value that only lives in Railway.

## Every secret

**Services:** `web` is the Next.js app, `api` the Express API, `worker` the pg-boss worker. `api` can also run as `combined.mts`, which holds the worker too. Where this runbook says "api + worker", set the variable on whichever services exist.

**Owners:** the Railway project admin is **rcfworks**. The vendor accounts are as recorded in their own docs. Production Zoho is Rodney's key, per [SponsorX-Zoho-Credentials-and-Sandbox.md §9](SponsorX-Zoho-Credentials-and-Sandbox.md). Confirm owners at each rotation.

### 1 · `CLERK_SECRET_KEY` (and the publishable key)

- **Where it lives:** `web`, `api` and `worker`. The `worker` only needs it where it verifies users. GitHub repository secret `CLERK_SECRET_KEY_TEST` holds the development instance's key for CI.
- **Owner:** the Clerk account owner (Clerk dashboard).
- **Rotate:**
  1. Clerk → the instance (Development for staging, Production for production) → **API keys** → **Secret keys** → **Add new key**.
  2. On Railway, set `CLERK_SECRET_KEY` to the new key on `web`, `api` and `worker`, then deploy.
  3. Check: sign in on the portal; an API call made from a portal page returns data, not a 401.
  4. Clerk → delete the **old** secret key.
  5. For CI: GitHub → Settings → Secrets → update `CLERK_SECRET_KEY_TEST`.
- **Downtime:** none. Both keys work until the old one is deleted.
- **The publishable key** (`CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`) is **not secret**. It only changes if the Clerk instance changes. On `web` it is baked in **at build time**, so changing it needs a rebuild, not just a restart.
- **Sessions:** there is no app session secret. Clerk issues and verifies sessions. To force everyone to sign in again, revoke sessions in Clerk.

### 2 · `DATABASE_URL` (the Postgres password)

- **Where it lives:** `api`, `worker` and the pre-deploy migration step. It is usually a reference to the Postgres service's own variable (`${{Postgres.DATABASE_URL}}`). `web` does not use it.
- **Owner:** the Railway project admin.
- **Rotate:**
  1. Railway → `postgres` service → **Data** or connect with `psql`. Run `ALTER ROLE <user> WITH PASSWORD '<new>';`.
  2. On the `postgres` service's **Variables**, set the password variable (`PGPASSWORD` / `POSTGRES_PASSWORD`) to the same new value. Every `${{Postgres.DATABASE_URL}}` reference then updates.
  3. Deploy `api` and `worker` straight away.
  4. Check `/health` on `api`, which pings the database. Then check the worker log.
- **Downtime:** a short window. Connections already open stay up, because the password is checked only when a connection is made. New connections from the old processes fail between steps 1 and 3. Do it in a quiet hour and keep steps 1–3 to a minute or two.
- **For a true zero-downtime rotation:** create a second login role with the same grants, point the services at it, deploy, then drop the old role.
- Take a backup first ([SponsorX-Database-Backup-Runbook.md](SponsorX-Database-Backup-Runbook.md)).

### 3 · `REDIS_URL` (the Redis password)

- **Where it lives:** `api`, as a reference to the Redis service's variable.
- **Owner:** the Railway project admin.
- **Rotate:**
  1. Railway → `redis` service → change its password variable (`REDIS_PASSWORD`) to a new value.
  2. Redeploy `redis`, then `api`.
- **Downtime:** none that users see. Redis holds only rate-limit counters and cache, and the rate limiter **fails open** when Redis is unreachable. For a minute, limits are not enforced.

### 4 · `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` (Cloudflare R2)

- **Where it lives:** `api` and `worker`. The worker derives images and QR codes, and reads files to attach to emails.
- **Owner:** the Cloudflare account owner (R2 → Manage API tokens).
- **Rotate:**
  1. Cloudflare → R2 → **Manage R2 API Tokens** → **Create API token**. Give it the **same** permission (Object Read & Write) and the same bucket scope (`S3_BUCKET_PUBLIC` and `S3_BUCKET_PRIVATE`).
  2. On Railway, set both variables on `api` and `worker`, then deploy.
  3. Check: `/health` on `api` reports storage reachable. An upload from a portal and a download link both work.
  4. **Wait 15 minutes.** That is the longest a presigned URL issued under the old key lives (`PRESIGN_TTL_SECONDS`).
  5. Cloudflare → **revoke the old token**.
- **Downtime:** none. Both tokens work until the old one is revoked.

### 5 · `ZOHO_WEBHOOK_SECRET` (+ `_PREVIOUS`)

- **Where it lives:** `api`, which verifies the invoice webhook from Zoho Books. Also in the webhook configuration in Zoho Books.
- **Owner:** the Railway project admin, together with the Zoho Books admin.
- **Rotate:**
  1. Generate a new value.
  2. On `api`, set `ZOHO_WEBHOOK_SECRET_PREVIOUS` = the current value and `ZOHO_WEBHOOK_SECRET` = the new value. Deploy.
  3. Zoho Books → Settings → Automation → Webhooks → the SponsorX invoice webhook → set the new secret and save.
  4. Check: edit a test invoice. In the database, the newest `WebhookDelivery` row with `source = 'zoho'` is `RECEIVED` and `signatureOk = true`, and no `REJECTED` rows with "signature did not verify" appear.
  5. Once Zoho has been sending the new signature for a while, **delete** `ZOHO_WEBHOOK_SECRET_PREVIOUS` on `api` and deploy. An hour is plenty, since Zoho retries for a day.
- **Downtime:** none.
- **Note:** production refuses to boot without `ZOHO_WEBHOOK_SECRET`, so never delete the current value.

### 6 · `ZOHO_NOTIFY_TOKEN` (+ `_PREVIOUS`)

- **Where it lives:** `api`, which checks the token on CRM callbacks, and `worker`, which subscribes Zoho's Notifications API with it and renews the subscription.
- **Owner:** the Railway project admin.
- **Rotate:**
  1. Generate a new value of at least 16 characters.
  2. On `api`, set `ZOHO_NOTIFY_TOKEN_PREVIOUS` = the current value and `ZOHO_NOTIFY_TOKEN` = the new value. Deploy `api` **first**.
  3. On `worker`, set `ZOHO_NOTIFY_TOKEN` = the new value and deploy. On start, the worker re-subscribes the channel with the token it holds, and its log prints `zoho.watch … renewed: true`. If it is a shared variable, `api` and `worker` change together; that is fine as long as `api` has the `_PREVIOUS` value.
  4. Check: change a test Account in the CRM. The newest `WebhookDelivery` row with `source = 'zoho-crm'` is `RECEIVED`.
  5. After an hour, **delete** `ZOHO_NOTIFY_TOKEN_PREVIOUS` on `api` and deploy.
- **Downtime:** none.
- **Order matters.** If the worker re-subscribes with the new token before `api` accepts it, callbacks are refused until `api` is deployed. They are recorded as `REJECTED`, and reconciliation catches up the records.

### 7 · `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN`

- **Where it lives:** `worker` only. Zoho never touches a request path.
- **Owner:** the account that created the Zoho API client. Development is `rcfworks@gmail.com`; production is Rodney (`rcarr@icarrefound.org`). Only the creating account can manage a client (Zoho credentials doc §9).
- **Rotate:**
  1. Zoho API Console → the client → regenerate the client secret, or create a new client.
  2. Mint a new refresh token with the same scopes (Zoho credentials doc §2.1a and §4).
  3. On `worker`, set all three variables and deploy.
  4. Check: the worker log shows a CRM sync job succeed, and `zoho.reconcile` runs. `ZOHO_EXPECTED_ORG_ID` refuses a token for the wrong org.
  5. Zoho → revoke the old refresh token.
- **Downtime:** none that users see. While the worker has no valid credentials, Zoho jobs wait in the Postgres outbox and retry. Sponsors, athletes and fans are unaffected.

### 8 · `RESEND_API_KEY`

- **Where it lives:** `worker`, which sends email.
- **Owner:** the Resend account owner.
- **Rotate:**
  1. Resend → API Keys → **Create API key** (Sending access, the SponsorX domain).
  2. On `worker`, set `RESEND_API_KEY` and deploy.
  3. Check: trigger a notification on staging, for example the contact form. The worker log shows it sent.
  4. Resend → delete the old key.
- **Downtime:** none. Email is queued in the outbox, and a send without a working key fails that job and retries.

### 9 · `INTAKE_TOKEN_SECRET` (+ `_PREVIOUS`): every emailed link

- **What it signs:**
  - the application "continue" link;
  - property onboarding (resume and email confirmation);
  - sponsor requests;
  - athlete email, guardian set-up and coming-of-age links;
  - hand-off, support and reactivation links;
  - fan unsubscribe links.
  - On staging, if `STANDIN_PROVIDER_SECRET` is unset, the stand-in's secret is **derived** from this one (see 10).
- **Where it lives:** `api` **and** `worker`, with **the same value on both**. Production refuses to boot with the development default, and refuses to boot if `_PREVIOUS` contains it.
- **Owner:** the Railway project admin.
- **Rotate:**
  1. Generate a new value. On **both** `api` and `worker`, set `INTAKE_TOKEN_SECRET_PREVIOUS` = the current value and `INTAKE_TOKEN_SECRET` = the new value. Deploy.
  2. Check: an old unsubscribe link and an old application link still open. A newly sent link opens too.
  3. **Keep `_PREVIOUS` for at least 30 days.** The longest-lived dated link is the 30-day hand-off. Several links have no expiry at all, among them unsubscribe and application "continue" (security review §A02).
  4. After that, delete `INTAKE_TOKEN_SECRET_PREVIOUS` on both services and deploy. Links older than the rotation stop working. A person with such a link uses the "send me a new link" path, or BTG re-sends it.
- **Downtime:** none with the overlap. **Without** the overlap, every link already sent breaks at once: unsubscribe links fail, which is a CAN-SPAM problem, and applicants are locked out of their drafts. Always use the overlap unless the old value has leaked.
- **If it has leaked,** skip the overlap. A leaked value lets anyone forge any of these links, so breaking old links is the lesser harm. Re-send the links that matter.

### 10 · `STANDIN_PROVIDER_SECRET` (+ `_PREVIOUS`): staging only

- **Where it lives:** `api` and `worker` on **staging**. Production uses `PAYMENT_PROVIDER=none` and refuses `standin`.
- **Owner:** the Railway project admin.
- **If it is unset:** with `NODE_ENV=production` (staging), it is derived from `INTAKE_TOKEN_SECRET`. So it is not the public development default, but it changes whenever that secret is rotated. Setting it explicitly is recommended, so the two are independent.
- **Rotate:**
  1. Set `STANDIN_PROVIDER_SECRET_PREVIOUS` = the current value and `STANDIN_PROVIDER_SECRET` = the new value, then deploy.
  2. After **1 hour**, the lifetime of a stand-in link, delete `_PREVIOUS` and deploy.
- **Downtime:** none. Without the overlap, a test-provider page open at that moment says the link expired; start the payment again.

### 10a · Stripe: `STRIPE_SECRET_KEY`, and the webhook signing secrets (+ `_PREVIOUS`)

- **Where it lives:** `api`. The full setup is in documentation/SponsorX-Stripe-Integration.md.
- **Owner:** the Railway project admin, together with whoever administers the Stripe account.
- **Rotate the secret key:**
  1. In Stripe, roll the key. Stripe keeps the old one valid for the overlap you choose.
  2. Set `STRIPE_SECRET_KEY` = the new key and deploy.
  3. Let the old key expire in Stripe.

  The boot guard refuses a live key outside production, and a test key in production.
- **Rotate a webhook signing secret:**
  1. In Stripe, roll the destination's secret. Stripe signs with both the old and the new secret during its overlap.
  2. Set `STRIPE_WEBHOOK_SECRET_PREVIOUS` = the old value and `STRIPE_WEBHOOK_SECRET` = the new value, then deploy.
  3. After Stripe's overlap ends, delete `_PREVIOUS` and deploy.

  The same steps apply to `STRIPE_THIN_WEBHOOK_SECRET` and `STRIPE_CONNECT_WEBHOOK_SECRET`.
- **Downtime:** none. A delivery refused in between is retried by Stripe for up to three days, and a redelivery is a no-op once it lands.

### 11 · `SPONSORX_EDGE_KEY` (+ `_PREVIOUS`)

- **Where it lives:** `web`, which sends it, and `api`, which checks it. The values must match.
- **What it protects:** the API believes the fan's forwarded address, used for rate limiting and geo, only when this key comes with it.
- **Owner:** the Railway project admin.
- **Rotate:**
  1. Generate a new value of at least 24 characters.
  2. On **`api` first**, set `SPONSORX_EDGE_KEY_PREVIOUS` = the current value and `SPONSORX_EDGE_KEY` = the new value, then deploy.
  3. On `web`, set `SPONSORX_EDGE_KEY` = the new value, then deploy.
  4. Delete `SPONSORX_EDGE_KEY_PREVIOUS` on `api`, then deploy.
- **Downtime:** none. If the order is wrong, nothing breaks, but the API falls back to the socket address for a few minutes, so every fan shares one rate-limit bucket. That is why `api` goes first.
- **Recommendation:** make sure this is **set** on production. Without it, every fan arriving through the web server counts against one bucket.

### 12 · GitHub Actions secrets

| Secret | Used by | Rotate |
|---|---|---|
| `CLERK_SECRET_KEY_TEST` | `ci.yml` e2e job | With 1 (Clerk development instance). GitHub → Settings → Secrets and variables → Actions → update. |
| `SLACK_WEBHOOK_URL` | `tracker-notify.yml` | Slack → the app's Incoming Webhooks → regenerate → update the secret. |
| `SHEET_ENDPOINT_URL`, `SHEET_ENDPOINT_SECRET` | `tracker-digest.yml`, `tracker-notify.yml` | Change the secret in the Apps Script endpoint and here together. |

Downtime: none for the app. Only the next CI or tracker run is affected.

### 13 · The Railway account itself

`npm run deploy` (`scripts/deploy.mjs`) uses the developer's own Railway CLI login, so there is no committed token. When someone with Railway access leaves, remove them from the project (Railway → project → Members) and rotate every secret above they could read. Start with 9, 5, 6 and 4.

## Not secrets, listed so nobody rotates them by mistake

- `CLERK_PUBLISHABLE_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- `ZOHO_NOTIFY_CHANNEL_ID`, `ZOHO_EXPECTED_ORG_ID` and `PUBLIC_INTAKE_TENANT_ID`.
- `APP_URL`, `API_URL`, `R2_PUBLIC_BASE_URL`, `S3_ENDPOINT` and the bucket names.
- `SUPPORT_EMAIL` and `EMAIL_FROM`.
- `GEOLITE2_CITY_PATH`. The MaxMind *licence key* used to download the database is a secret, but it is not used by the app.

## After any rotation

- Run the "check" step for that secret on staging, then repeat the whole rotation on production.
- Note the rotation in the day's `Memory/` log: which secret, which environment, when. **Never write the value.**
- If the rotation followed a leak, also look through the audit log and `WebhookDelivery` for use of the old value while it was exposed.
