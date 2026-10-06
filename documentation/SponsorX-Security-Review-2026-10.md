# SponsorX Security Review — October 2026

**Task:** 2S8-SEC-02 · OWASP review and dependency scanning
**Date:** 2026-10-05 · **Scope:** `backend/src` (Express API), `backend/worker` (pg-boss worker), `frontend/src` server code (route handlers, server actions, `proxy.ts`, `next.config.ts`), and the npm dependency tree.
**Done when:** OWASP testing is complete, the dependency scan is clean, and secrets rotation is in place. Rotation is documented separately in [SponsorX-Secrets-Rotation.md](SponsorX-Secrets-Rotation.md).

## How the review was done

The checks were made against the OWASP Top 10 (2021), plus the ASVS basics that matter for a platform with external users, money movement and file uploads.

1. **Reading the code.** Every `:id` route was traced into its domain function: 239 routes, of which 199 are authenticated and 40 are public. Also traced:
   - every raw-SQL call;
   - every server-side `fetch`, presign, `redirect` and `dangerouslySetInnerHTML`;
   - every webhook and signed-link verifier.
2. **The existing guard tests:** `tenant-isolation`, `tenant-scope.static`, `authz.coverage`, `authz.matrix` and `authz.row-scope`.
3. **New automated tests for each finding:**
   - `backend/tests/security-review.test.ts`
   - `backend/tests/rate-limit-expiry.test.ts`
   - one new case in `backend/tests/deliverable.chain.test.ts`
   - one new case in `backend/tests/authz.row-scope.test.ts`
   - `frontend/tests/security-review.test.ts`
   - `scripts/security-scripts.test.mjs`
4. **`npm audit`** on the root lockfile. The workspaces share it, so the per-workspace runs give the same answer as the root. A secret scan was also run over every tracked file.

**Result key:** **Pass** means checked and nothing to fix. **Fixed** means a real finding, fixed here, with a test. **Open** means a finding not fixed here, with a recommendation. **Owner** means it needs a decision from the programme owner.

## Findings by OWASP category

### A01 · Broken access control

**Checked:**
- How the actor is resolved. Tenant and roles come from Postgres, never from token claims.
- `assertAllowed` / `whereFor` / `assertTenantWide` on all 199 authenticated `:id` routes.
- Public routes and their tokens.
- Guardian ward switching.
- Same-tenant IDOR.
- Open redirects (`returnPath` on both servers, `/t/[code]`, the admin ID-document redirect).
- Path traversal into API URLs.

**Result:**
- **Pass:** every authenticated lookup is scoped, and "not found" and "not yours" give the same 403.
- **Fixed, F1 (Medium).** `POST /deliverables/:id/assets` stored any `r2Key` the client sent. The asset's download link is presigned from that key, so an athlete could register another tenant's reward-QR image (a live bearer token) or a sponsor report and read it back.
- **Fixed, F3 (Low, latent).** The `user` scope `own-sponsor` matched every sponsor's users in the tenant. Only a BTG route used it, so nothing leaked.
- **Fixed (Low).** `safeReturnPath` on both servers accepted `/\t/evil.example`. Browsers strip the tab, which turns it into `//evil.example`.
- **Fixed (Low).** `/t/[code]` passed `..` to the API, and `fetch` resolves that to a different endpoint. It also did not re-check that the destination is http(s).
- **Fixed (Low).** The admin ID-document action redirected to any URL the API returned.
- **Fixed (Low), 2S8-SEC-05.** `GET /athletes/:id/rates` answered `200 []` for another athlete in the same tenant but 403 for an id that doesn't exist, which revealed which ids exist. The rates themselves were scoped. `readRateCard` now checks the athlete is within the caller's **own** reach (an athlete's own id, a guardian's ward, BTG's tenant) before it answers. Another athlete's id and a made-up one now give the same 403, word for word. Test: `backend/tests/security-hardening.test.ts`, block "1".
- **Open (Low).** The public "claim this profile" flow (`/public/athletes/:slug/claim`) puts an unverified email onto the athlete once an advisor approves it. **Owner:** should the claimant confirm the email first?

**Fix:**
- `registerCreativeAsset` refuses with `CreativeKeyError` (422) any key outside `t/<tenant>/deliverable/<id>/`, and any key containing `..`, `.` or `\`.
- `whereFor(…, "user")` with scope `own-sponsor` now gives `{tenantId, sponsorId: actor.sponsorId}`, or nothing when the actor has no sponsor.
- Frontend: a single helper, `frontend/src/lib/safe-path.ts`, now does the redirect check. It also rejects control characters. The backend `payouts.safeReturnPath` does the same.
- `/t/[code]` accepts only base64url codes and only absolute http(s) destinations.
- The admin ID-document redirect accepts only `https:` (`http:` too outside production, for local MinIO).

**Test:**
- `deliverable.chain.test.ts`, "refuses a key outside this deliverable's own folder".
- `authz.row-scope.test.ts`, "scopes a sponsor admin's users…".
- `security-review.test.ts` (both servers), the "A01" blocks.

### A02 · Cryptographic failures

**Checked:**
- Every HMAC link: algorithm, constant-time compare, length check, expiry.
- Webhook secrets.
- Default secrets in production.
- Random token entropy. Reward tokens are 160-bit; tracking and student codes are 72-bit.

**Result:**
- **Pass:** HMAC-SHA256 throughout, with `timingSafeEqual` and a length check, and no plaintext secrets at rest.
- **Fixed (High on staging).** The stand-in payment provider signed its links with the public default `dev-standin-provider-secret` unless `STANDIN_PROVIDER_SECRET` was set. Staging runs with `NODE_ENV=production`. Anyone who had read the repo could forge a link that marks a payout account READY or a checkout paid.
- **Open (Low).** Intake, onboarding, sign-up, sponsor-request and unsubscribe links never expire. The intake HMAC also has no purpose prefix. **Owner:** decide how long each link should live. Unsubscribe links must keep working.

**Fix:**
- With `NODE_ENV=production` and no `STANDIN_PROVIDER_SECRET`, the secret is now derived from `INTAKE_TOKEN_SECRET`, under its own label. That secret is already required to be real in production. So staging is protected without any Railway change, and setting the variable explicitly still takes precedence.
- Production also refuses to boot if `INTAKE_TOKEN_SECRET_PREVIOUS` is set to the development default.

**Test:** `security-review.test.ts`, "A02/A07 · the stand-in provider's development secret never signs on staging" and "refuses to boot in production with the development default kept as 'previous'".

### A03 · Injection

**Checked:**
- Every `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, `$executeRawUnsafe` and `Prisma.raw` call.
- Worker `pg.query` calls.
- Zoho COQL.
- XSS: `dangerouslySetInnerHTML`, the hand-written fan and unsubscribe HTML, the PDF renderer.
- Email template injection.

**Result:**
- **Pass:**
  - Raw queries are tagged templates or use `$n` parameters.
  - `$executeRawUnsafe` is used only with `$1` parameters (advisory locks) or with savepoint names from a module counter.
  - COQL escapes its key.
  - The one `dangerouslySetInnerHTML` is a static theme script.
  - The fan and unsubscribe HTML escapes every value.
  - The PDF renderer escapes strings and blocks every network request.
  - Every email is `text`-only, so there is no HTML injection.
- **Fixed (Medium).** The public contact form's `support.copy` email went to an unverified address and repeated the sender's name and message, up to 5,000 characters. Rotating IPs got around the rate limit, so anyone could send their own text (for example a phishing link) from SponsorX's domain to any inbox.

**Fix:** `support.copy` now prints only the topic, which is one of our own words, and our reference. BTG's own copy (`support.message`) is unchanged.

**Test:** `security-review.test.ts`, "support.copy prints neither the message nor the name".

### A04 · Insecure design

**Checked:**
- File uploads: presigned URLs, content-type and size, key prefixes, the public bucket.
- Rate limiting: coverage, keying, failure mode.
- Webhooks: replay.
- Mass assignment.

**Result:**
- **Pass:**
  - Keys are built by the server under tenant and owner prefixes, and `assertSafeKey` is enforced.
  - Presigned URLs live 15 minutes, documents go to the private bucket, and type allowlists exist.
  - Every `/public/*`, intake, onboarding, hand-off, support, fan-redeem and stand-in route is rate-limited by client IP (`SPONSORX_EDGE_KEY` forwarding).
  - Redis fails open by design.
  - Mass assignment: no `req.body` reaches Prisma directly. Every body is parsed by Zod, which strips unknown keys; 70 of 149 input schemas are also `.strict()`. `tenantId`, role and state are always set by the server.
- **Fixed (Medium).** The branding logo was presigned to the **public** CDN bucket with neither its type nor its size pinned, so any file could be served from `R2_PUBLIC_BASE_URL`.
- **Fixed (Low).** Delivery-proof uploads checked only that the file existed, not its size.
- **Fixed (Medium).** Webhook rate limits were keyed on `req.ip`, which is the platform edge, so every caller shared one bucket. 120 junk requests a minute could make Zoho's real, signed deliveries fail with 429.
- **Fixed (Low).** A rate-limit key that lost its EXPIRE (INCR and EXPIRE are two separate commands) kept that caller blocked forever.
- **Fixed (Medium), 2S8-SEC-03.** The other private-bucket presigns (account, onboarding, organisation, sponsor-request, hand-off, support and profile-change documents) pinned neither type nor length. Their confirm step checked size but not the content type, and did not delete an oversized object.
  - Every private presign is now signed for one type and one exact size: `{signContentType: true, contentLength}` at all ten `presignPrivateUpload` calls. That includes the delivery proof, which had neither, and the deliverable creative upload, whose `bytes` was optional and is now required (`CreativeUploadInput`). Ad artwork was already pinned.
  - Every confirm step now goes through one helper, `checkPrivateUpload` (`backend/src/lib/storage.ts`). For the deliverable creative and the ad artwork, the confirm step is the register step (`registerCreativeAsset`, `registerArtwork`); both call it with the type and size their grant's audit row recorded. It reads the object's `HeadObject` type and size and compares them with what the grant pinned: the exact size, and the flow's ceiling. On a mismatch it deletes the object, writes a `storage.privateUploadRefused` audit row (expected vs arrived), and the flow answers 422 "…so it was removed. Upload it again." The delivery proof reads the pinned type and size back from its grant's audit row.
  - The browser side needed no change. Every upload component already PUTs the `File` it declared, with the grant's own `contentType` (or, for the deliverable upload, `f.type`, which is what it presigned). A zero-byte creative file is now refused at presign.
- **Fixed (Low), 2S8-SEC-04.** Replay of an old signed invoice webhook could roll an invoice's status back. Zoho Books sends no timestamp.
  - The ingest now refuses any payload that would move the **stored** state backwards. The forward order comes from Zoho's own words (`backend/src/domain/invoice-status-rules.ts`): `draft` < `sent` / `viewed` / `unpaid` < `partially_paid` / `overdue` < `paid`. A live invoice with nothing owed counts as paid, as in 2S4-BE-10. `void` is reachable from any unpaid state. `paid` and `void` are terminal: once paid, only another paid payload is applied (so a corrected amount still lands); once void, only void.
  - The check applies to both mirrors, the campaign invoice and the marketplace order's. A refusal writes an `invoice.staleRefused` audit row (stored state, incoming state, reason) and marks the delivery `REJECTED` with the reason. The route still answers Zoho `202`, and the job finishes without throwing, so neither Zoho nor pg-boss retries it.
  - Trade-off: a genuine move backwards in Zoho, such as a payment deleted or a void turned back into a draft, is held the same way. It cannot be told apart from a replay without the timestamp Zoho does not send. The audit row and the `REJECTED` delivery are where BTG sees it.

**Fix:**
- `requestLogoUpload` signs `Content-Type` and `Content-Length` into the presigned PUT.
- 2S8-SEC-04: `backwardsMove` (invoice-status-rules.ts) and `refuseIfBackwards` (invoice-replay.ts), called by `ingestZohoInvoice` and `ingestOrderInvoice` before anything is written. `handleIngestInvoice` marks a refused delivery `REJECTED`.
- `checkProof` refuses an arrived file over 10 MB.
- The Zoho hooks now rate-limit **only unverified** attempts; a verified delivery is never throttled.
- `rateLimit` re-sets the expiry on any key with TTL −1.

**Test:**
- `rate-limit-expiry.test.ts`.
- The logo and proof changes are one-line pins on code that existing branding and delivery tests already cover.
- 2S8-SEC-03: `backend/tests/private-upload-pins.test.ts`, end to end with no storage mock. The API presigns against an in-process S3 endpoint (`tests/support/object-store.ts`) that checks presigned signatures the way R2 does. For each of the ten flows (the eight document and proof uploads, plus the creative and artwork register steps) the test checks five things:
  1. the URL signs `content-length;content-type;host`;
  2. a PUT with another type, or one byte more or less, is refused 403;
  3. a wrong-type file placed in the bucket anyway is refused on confirm, deleted and audited;
  4. so is a wrong-size one;
  5. the right file PUT through the URL is accepted.

  A last case fails if any `presignPrivateUpload` in `src/domain` lacks either pin. Removing one pin in a scratch run failed both cases.
- 2S8-SEC-04: `backend/tests/invoice-replay.test.ts`. The rule is tested pure: forward moves apply, paid never goes back (void included), void is never reopened, and an older open state is refused. It is then tested end to end: a correctly signed delivery is POSTed to the real route and the worker's job applies it. For a campaign invoice, sent then paid, the replayed `sent` bytes get `202`, the delivery is `REJECTED`, the stored row is unchanged and still paid, and the refusal is audited. So are older `draft`, `overdue` and `void` payloads, while a later paid correction still lands. For an open invoice, overdue never returns to sent. A marketplace order's paid invoice is not rolled back either.

### A05 · Security misconfiguration

**Checked:**
- Security headers on the API and the web app.
- `X-Powered-By`.
- CORS.
- Body size limits.
- Error bodies.
- `serverActions.allowedOrigins`.
- `/test-provider` pages in production builds.

**Result:**
- **Pass:**
  - The API has no CORS middleware, so there is no `*` with credentials.
  - `express.json` uses the default 100 kB limit.
  - A 5xx returns only a reference id.
  - `allowedOrigins` is not set, so Next's strict Origin check applies.
  - `/test-provider` pages ship to production, but production uses the `none` provider, so no link can open them.
- **Fixed (Medium).** Neither server set any security headers, and both advertised their framework in `X-Powered-By`. The fan, unsubscribe and stand-in pages, whose URL **is** the credential, could be framed and could leak the token in the Referer header.
- **Owner.** A full script/style CSP needs to allow Clerk, Turnstile, the R2 upload host and the inline `<style>` on `/r` and `/u`. Recommendation: roll it out in `Content-Security-Policy-Report-Only` first.
- **Owner.** HSTS is set **without** `includeSubDomains` and `preload`. Both commit every `sponsorx.net` host to HTTPS. **Decided 2026-10-06:** `includeSubDomains` on, `preload` off (decision 2 below).

**Fix:**
- API (`app.ts`):
  - `x-powered-by` is off.
  - Every response now carries `nosniff`, `X-Frame-Options: DENY`, `CSP default-src 'none'; frame-ancestors 'none'` and `Referrer-Policy: no-referrer`.
- Web (`next.config.ts`):
  - `poweredByHeader: false`.
  - Every path gets HSTS (1 year), `nosniff`, `X-Frame-Options: DENY`, `CSP frame-ancestors 'none'; base-uri 'self'; object-src 'none'`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy` turning off camera, microphone and geolocation.
  - `/r/*`, `/u/*` and `/test-provider/*` get `Referrer-Policy: no-referrer`.

**Test:**
- `backend/tests/security-review.test.ts`, "A05 + A07 · the API over HTTP, in production mode". This is a real HTTP round trip.
- `frontend/tests/security-review.test.ts`, "A05 · security headers".

### A06 · Vulnerable and outdated components

**Checked:** `npm audit` across the whole tree and on production dependencies only.

**Result:**
- **Fixed.** The tree had 14 findings: 1 critical, 10 high, 2 moderate and 1 low. It now has 0 in production. Five high findings remain in dev only, all from one advisory, which is allowlisted. Details in [Dependency scan](#dependency-scan) below.

**Fix:**
- `next` 16.3.5 → 16.3.8 (critical: RCE in `next/og`) and `eslint-config-next` to match.
- `vite` 7.1.12 → 7.3.6.
- `dompurify` 3.4.16 (lockfile).
- Overrides: `uuid` ^11.1.1 under `exceljs`, `mysql2` 3.24.5 under the `prisma` CLI, `deepmerge-ts` 8.0.2 under `@prisma/config`.

**Test:**
- `npm run audit:check` (CI).
- After the upgrades: both builds, both suites, `prisma generate` / `migrate deploy` / `validate`, and an exceljs write/read round trip.

### A07 · Identification and authentication failures

**Checked:**
- Clerk session handling (Bearer token and cookie).
- The test-auth header `x-test-clerk`.
- Sign-out.
- Disabled accounts.
- Clerk `authorizedParties`.

**Result:**
- **Pass:**
  - `x-test-clerk` exists **only** in test files, which `vi.mock` the Clerk module. `src/auth/clerk.ts` has no test branch and never reads `NODE_ENV`, so the header cannot be honoured in production or anywhere else.
  - Disabled accounts are refused.
- **Fixed (High).** The portal "Log out" button only navigated to `/login`. The Clerk session survived, and `/login` sent the still-signed-in visitor straight back into the portal. On a shared device, the next person was signed in as the previous one.
- **Owner (Low).** Clerk's `authorizedParties` is not set on the API. Setting it to `APP_URL`'s origin hardens cookie auth. But it must list every web origin that mints sessions (staging, production, the Vercel test environment), or sign-in breaks there.

**Fix:**
- `UserMenu` calls Clerk's `signOut({ redirectUrl: "/" })`.
- Before that, a new server action `clearSessionCookiesAction` drops SponsorX's own `sx-ward` cookie.

**Test:**
- `backend/tests/security-review.test.ts`: `x-test-clerk` is refused (401) by the real app in production mode, and no file under `src/` or `worker/` reads a test-auth header.
- `frontend/tests/security-review.test.ts`: "A07 · signing out ends the session" and "no test or mock auth reaches the web app".

### A08 · Software and data integrity failures

**Checked:**
- Webhook signatures.
- The CI supply chain: lockfile, `npm ci`, install scripts.
- Secrets in the repository.

**Result:**
- **Pass:**
  - CI installs exactly what the lockfile says (`npm ci`).
  - npm 11 `allowScripts` gates install scripts.
  - The secret scan of 2,220 tracked files is clean.
- **Fixed (Medium, correctness).** The invoice webhook's HMAC was computed over `JSON.stringify(req.body)`, not the bytes Zoho sent. A genuine delivery whose key order or number format differs would fail.
- **Added.** Zero-downtime rotation for every secret that verifies incoming data. See the rotation runbook.

**Fix:**
- `express.json` keeps the raw body for `/api/v1/webhooks/*`, and the signature is checked over it. The re-serialised form is still accepted.
- New `scripts/secret-scan.mjs`, enforced by CI.

**Test:**
- `security-review.test.ts`, the rotation blocks.
- `scripts/security-scripts.test.mjs`.

### A09 · Security logging and monitoring failures

**Checked:**
- Secrets in logs and errors.
- The audit trail on writes.
- Webhook attempts.

**Result:**
- **Pass:**
  - Error bodies carry a reference id, never a stack trace.
  - No token, `Authorization` header, env value or `DATABASE_URL` is logged.
  - Every write is audited (`financial-audit-coverage`).
  - Every webhook attempt is recorded as RECEIVED or REJECTED, without the token it carried.
- **Fixed (Info), 2S8-SEC-05.** The worker logged non-fan recipients' email addresses.

**Fix:**
- Every line `worker/index.mts` logs now goes through one `log()`, which masks any address to its domain (`redactEmails`, `backend/src/lib/redact.ts`). So `rosa@school.org` is logged as `…@school.org`.
- The two lines that named a recipient (`notify.email`, `notify.invitationSent`) and the persona seed's "skipped" line use `maskEmail`.

**Test:**
- Existing: `error-body`, `financial-audit-coverage` and `zoho-webhook`.
- 2S8-SEC-05: `security-hardening.test.ts`, block "4". It checks the masking, that the worker's only `console.log` is inside the redacting `log()`, and that no worker log line interpolates an `email` or `to` value unmasked.

### A10 · Server-side request forgery

**Checked:**
- Every server-side `fetch`.
- The PDF renderer (Playwright `setContent`).
- Tracking redirects.
- Zoho calls.

**Result:**
- **Pass:**
  - The web server fetches only `API_URL`.
  - The API fetches only Zoho hosts that are fixed in env.
  - The PDF renderer aborts every request and accepts the logo only as a `data:image/(png|jpeg)` URI.
  - Tracking destinations are restricted to http(s) at write time and again at read time.
- **Fixed (Low), 2S8-SEC-05.** Chromium ran with `--no-sandbox` and JavaScript on. The report template was confirmed to need no script: it has no `<script>`, no handler attribute and no `javascript:` link, and a real report was rendered and checked. `renderPdf` now opens its page with `javaScriptEnabled: false`. `--no-sandbox` is unchanged; it was outside this item.
- **Fixed (Low), 2S8-SEC-05.** Zoho CRM notification `module` and `ids` were free strings that ended up in a Zoho API path. They were only accepted after the channel token verified. `ZohoCrmNotification` now holds `module` to `ZOHO_CRM_MODULES` (Accounts, Contacts, Deals, Tasks: exactly the worker's `WATCH_EVENTS`) and each id to `^\d{1,40}$`. Anything else is refused as `WebhookBodyError` and recorded REJECTED.

**Fix:** none needed for SSRF; the two hardening items above.

**Test:**
- Existing: `report-render` and `tracking`.
- 2S8-SEC-05 (PDF): `report-render.test.ts` asserts the real rendered report HTML carries no script and prints it to a real PDF with JavaScript off. `security-hardening.test.ts`, block "3", renders HTML whose script would rewrite `document.title` and checks that the PDF's `/Title` is still the static one.
- 2S8-SEC-05 (CRM): `security-hardening.test.ts`, block "2". It checks the four modules are accepted, other modules and path-like or non-digit ids are refused, and the enum equals `WATCH_EVENTS`.

### Other checks

| Check | Result |
|---|---|
| **CSRF**, server actions | Pass. Next 16's Origin-vs-Host check is on, because `allowedOrigins` is not set. |
| **CSRF**, API | Pass. The browser never calls the API: portals call it server-to-server with a Bearer token, so there is no ambient cookie. |
| **CSRF**, public POST route handlers (`/r/*/claim`, `/r/*/redeem`, `/u/*`) | Pass. They are authorised by the token in the URL, not by a cookie. |
| **Guard tests** | **Fixed (Info), 2S8-QA-07.** `tenant-scope.static` checked reads only, and `tenant-isolation` swept across tenants but not within one (sponsor vs sponsor, athlete vs athlete). Both are extended; see [Guard tests, extended](#guard-tests-extended-2s8-qa-07) below. |

### Guard tests, extended (2S8-QA-07)

**`tenant-scope.static` now checks writes too.** It covers every `update`, `updateMany`, `delete`, `deleteMany` and `upsert` on the request path, and every raw SQL statement that writes (`UPDATE` / `DELETE FROM` / `INSERT INTO`). Each must carry its tenant (`whereFor`, a `tenantId`) or a `tenant-scope:` note naming the scoped read it relies on. The note goes inside the call or in the comment directly above it. A note elsewhere in the function does not count, and neither does a JSDoc example. A self-test pins what the check flags and what it passes.

The first run found 45 unscoped writes; no raw SQL write was unscoped.
- **Fixed, 3.** The tenant is now in the write itself:
  - the athlete state move (`athlete.ts`, `tenantId: actor.tenantId`);
  - launch's activation of a campaign's orders (`campaign.ts`, `tenantId: campaign.tenantId`);
  - the application's social-accounts replace (`application-intake.ts`, the intake `tenantId`).
- **Justified, 42**, each with its own note at the call. On review, every one writes a row that the same function had just reached through a tenant- or account-scoped read: `whereFor`, a signed public token, the order being moved, or worker-side Zoho ingest resolved from its deal. None was blanket-justified: the five `followOrder` writes in `delivery.ts` each carry the note, where before one comment at the top of the function covered all of them.
- **Not caught** by a static check: writes made inside SQL functions (`reward_reserve`, `reward_redeem`), called through `SELECT`. They are keyed by the fan's opaque token and covered by the reward tests.

**`tenant-isolation` now sweeps within a tenant.**
- Tenant A gains a second sponsor admin (`ti_a2_sponsor`) and a second athlete (`ti_a2_athlete`). As each of them, every route aimed at a tenant-A record is called with the first sponsor's or first athlete's ids, with a valid body for writes. Covered: campaign orders, marketplace orders, offers, payouts, deliverables, briefs and listings, both read and write, plus campaigns, earnings, invitations, sales, deliveries and the rest of `PARAM_FOR`.
- Each call must be refused, and must not crash or stop at validation.
- Every list read (`GET` without an id) must not show any of the first accounts' private ids or values. The published athlete listing is the only exception, being catalogue-visible by design.
- A positive control has the owners read the same records with 200.
- The existing fingerprint check then proves nothing tenant A owns changed.

**Shown failing on a deliberately broken route (scratch run, not committed).** Three breaks were made together:
1. `GET /briefs/:id` scoped by `{ tenantId }` instead of `whereFor(campaignBrief, read)`;
2. `respondToOffer` scoped by `{ tenantId }` instead of `whereFor(offer, write)`;
3. the `tenant-scope:` note removed from one `campaignOrder.update`.

Three tests then failed:
- the static write check, naming `campaign-order.ts:219 campaignOrder.update`;
- the same-tenant sweep, which reported `ti_a2_sponsor` and `ti_a2_athlete` reading `ti_brief_a` (leaking "TI secret objective"), and `ti_a2_athlete` answering `ti_offer_a` with 200;
- the fingerprint check, which caught the offer that changed.

The cross-tenant sweep still passed with the brief break in place, which is the gap this closes. All three files were restored.

**Same-tenant leaks found: none.** Before the break, every route aimed at a record (197 per account), run as each of the two accounts, was refused, and no list read leaked.

## Dependency scan

Every number below comes from running `npm audit --json` on the root lockfile. The workspaces share that lockfile, so `-w` runs give the same answer.

| | Total | Critical | High | Moderate | Low |
|---|---|---|---|---|---|
| **Before**, whole tree | 14 | 1 | 10 | 2 | 1 |
| **Before**, production only (`--omit=dev`) | 4 | 1 | 0 | 2 | 1 |
| **After**, whole tree | 5 | 0 | 5 | 0 | 0 |
| **After**, production only | **0** | 0 | 0 | 0 | 0 |

### What was fixed, and how

| Package | Advisory | Where it comes from | Fix |
|---|---|---|---|
| `next` | GHSA-vcvr-r3jv-pc5j (critical, RCE in `next/og` ImageResponse) | frontend, production | 16.3.5 → **16.3.8** (patch). `eslint-config-next` moved to 16.3.8 to match. Frontend build and all 1,141 frontend tests pass. |
| `vite` | GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583, GHSA-v6wh-96g9-6wx3, GHSA-fx2h-pf6j-xcff (high, dev server) | both workspaces, dev | 7.1.12 → **7.3.6** (minor). Both vitest suites pass. |
| `dompurify` | GHSA-p98j-92pf-mc4p (low) | `jspdf`, production | `npm audit fix`: 3.4.15 → 3.4.16. |
| `uuid` | GHSA-w5hq-g745-h8pq (moderate) | `exceljs@4.4.0`, production | Override `exceljs > uuid ^11.1.1`. npm's own suggestion was to downgrade exceljs to 3.4. exceljs only calls `require('uuid').v4`, which uuid 11's CommonJS build provides. Checked with a conditional-formatting workbook written and read back, which is the code path that calls v4. |
| `mysql2` | GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3 (high) | `prisma@7.10.0` CLI, dev | Override `prisma > mysql2 3.24.5` (same major). npm's suggestion was a downgrade to Prisma 6. We use Postgres only. |
| `deepmerge-ts` | GHSA-ggr8-5vv4-36mx (high) | `@prisma/config@7.10.0`, dev | Override `@prisma/config > deepmerge-ts 8.0.2`. 7.10.0 is the newest Prisma 7, and 8.0 is only a release candidate. Checked with `prisma generate`, `prisma validate` and `prisma migrate deploy` on the test database, plus the whole backend suite. |

**The lockfile change is limited to these fixes.** Comparing package versions before and after: 19 entries removed and 45 added. They are exactly the packages above, plus `vite` 7.3's own `esbuild` 0.28.2 and its 26 platform binaries, plus `sql-escaper` (a dependency of mysql2 3.24). Nothing else moved. The line-based `git diff` looks large only because hoisting reordered entries.

### The allowlist: one advisory, dev-only

`scripts/audit-allowlist.json`:

| Advisory | Package | Path | Why it is not exploitable here |
|---|---|---|---|
| GHSA-vfj7-8cjw-p6xm (high, stack-exhaustion DoS) | `braces@3.0.3` | `eslint-config-next@16.3.8 > @next/eslint-plugin-next > fast-glob > micromatch > braces` (frontend **devDependency**) | No patched `braces` exists, because every version is in range. npm's only "fix" is downgrading `eslint-config-next` to 14.2, two majors behind Next 16. `braces` runs only inside ESLint, on glob patterns from our own lint config, on a developer machine or CI runner. It is not in the production install (`--omit=dev` reports 0), and it never sees user input. |

This one advisory accounts for all five remaining "high" rows, which are the chain `braces → micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next`.

The entry has `reviewBy: 2027-01-05`. After that date CI fails until someone re-checks it. Remove the entry as soon as a fixed `braces` or `fast-glob` ships.

### What CI enforces

The `security` job in `.github/workflows/ci.yml` runs nightly and by hand, on the same triggers as the other jobs. It is **not** skipped when `main` is unchanged, because a new advisory against a package we already ship appears without any commit. It needs no install, because `npm audit` reads the lockfile. It runs `npm run audit:check` (`scripts/audit-check.mjs`), which fails on any of:

1. any **high or critical** advisory in **production** dependencies, even one that is allowlisted as dev-only;
2. any **moderate or worse** advisory anywhere that is **not** allowlisted (low ones are printed but don't fail);
3. any allowlist entry past its `reviewBy` date.

The same job runs `npm run secrets:scan`, and runs `npm run test:security-scripts` to prove both scanners catch what they claim to. `deploy-daily.yml` only deploys on a successful CI run, so a failing scan also holds the deploy.

### Secret scan

`scripts/secret-scan.mjs` reads every git-tracked text file. It skips the lockfile, binaries and files over 5 MB. It looks for:
- Stripe/Clerk `sk_live_…` / `sk_test_…` secret keys, `pk_live_…` and `whsec_…`;
- AWS `AKIA…` / `ASIA…` keys, and S3/R2 secret and access-key assignments;
- PEM private keys;
- Zoho `1000.…` OAuth tokens;
- Resend `re_…` keys;
- GitHub tokens and Google API keys;
- Postgres URLs that carry a password for a host that isn't local.

It deliberately ignores:
- `pk_test_` publishable keys;
- test placeholders like `"sk_test_x"` (too short to match);
- the local-stack `sponsorx:sponsorx@localhost` URLs.

Matches are printed masked. **Result on 2026-10-05: 2,220 tracked files, no secrets found.** It scans the current tree, not git history.

**Git history, 2S8-SEC-05.** `npm run secrets:scan:history` (`scripts/secret-scan.mjs --history`) runs the same rules over every line ever added, in every commit reachable from any ref. It reads `git log --all --full-history -p --cc`, so merge resolutions and side branches are included, and skips the lockfile and binaries as the tree scan does. It needs no new dependency. `gitleaks` was not used: it is not installed, and `npx gitleaks` would download it. **Result on 2026-10-05: 868 commits, 4,433,222 added lines, no secrets found.** Test: `scripts/security-scripts.test.mjs`, "secret scan --history". In a throwaway repo, a key committed and then deleted is found and attributed to the commit that added it, masked.

## Decisions for the owner

**All seven were decided by the programme owner on 2026-10-06, and are implemented under 2S8-PMO-02.** Each item says what was decided and what was done.

1. **Full CSP.** Roll out a script/style CSP in report-only mode first. It has to allow Clerk, Turnstile, the R2 upload host and the inline styles on `/r` and `/u` (§A05).
2. **HSTS `includeSubDomains` / `preload`.** Both commit every `sponsorx.net` host to HTTPS (§A05).
   - **Decided (owner, 2026-10-06):** `includeSubDomains` yes, `preload` no.
   - **Done:** the web app now sends `Strict-Transport-Security: max-age=31536000; includeSubDomains` on every path (`frontend/next.config.ts`). Every `sponsorx.net` host must therefore serve HTTPS. `clerk.` and `accounts.` already do (issued certificates, `.claude/stack-decision.md`); any subdomain added later, a CDN for example, needs its certificate before anyone opens it in a browser. Preload is not set: the preload list ships inside browsers and takes months to leave. The API sends no HSTS and still doesn't: it serves only JSON, and its public domain only takes webhooks, so the web app owns the header.
   - **Test:** `frontend/tests/security-review.test.ts`, "A05 · security headers", pins the exact value and that `preload` is absent.
3. **Clerk `authorizedParties`.** List every web origin that mints sessions before turning it on (§A07).
4. **Link lifetimes.** Decide how long intake, onboarding, sign-up and sponsor-request links should live. The intake link should also gain a purpose prefix, using the `_PREVIOUS` overlap so links already sent keep working (§A02).
5. **Profile-claim email.** Should a claimant confirm their email before an advisor can verify the claim (§A01)?
6. **Production `PAYMENT_PROVIDER`.** Set `PAYMENT_PROVIDER=none` explicitly on Railway production. The stand-in is chosen whenever `RAILWAY_ENVIRONMENT_NAME` is not exactly `production`, so a renamed environment would quietly switch it on. The boot guard only catches an *explicit* `standin`.
7. **Staging `STANDIN_PROVIDER_SECRET`.** Staging is now safe without it (the secret is derived), but setting it explicitly makes rotation independent of `INTAKE_TOKEN_SECRET`. It is in the rotation runbook.

## Follow-ups not done here (each was Open above; struck through when closed)

- ~~Pin type and length on every private presign, and check type on confirm (§A04).~~ Fixed, 2S8-SEC-03.
- ~~Make the invoice ingest refuse an older state (§A04).~~ Fixed, 2S8-SEC-04.
- ~~Close the rate-card existence oracle (§A01).~~ Fixed, 2S8-SEC-05.
- ~~Constrain Zoho notification `module` and `ids` (§A10).~~ Fixed, 2S8-SEC-05.
- ~~Turn off JavaScript in the PDF renderer (§A10).~~ Fixed, 2S8-SEC-05.
- ~~Extend the guard tests to writes and same-tenant cases (§Other checks).~~ Fixed, 2S8-QA-07.
- ~~Add `import "server-only"` to `frontend/src/server/{api,edge,payouts}.ts`.~~ Fixed, 2S8-SEC-05.
  - The three files import it. It resolves to the copy in the lockfile, which `@clerk/nextjs` depends on; Next itself handles the import and needs no direct dependency.
  - Five vitest files that load those modules directly now `vi.mock("server-only")`, as they already mock `next/server` and `next/headers`. No config was changed.
  - Test: `frontend/tests/security-review.test.ts`, "2S8-SEC-05". It checks each file imports the marker, that the real marker throws outside a server bundle, and that no `"use client"` module reaches the three files through its imports. Adding such an import in a scratch run failed it.
  - The frontend typecheck and full vitest pass. `next build` was not run: free disk on the build machine was 1.6 GB, and the build output would compete with other sessions.
- ~~Optionally run a git-history secret scan, for example gitleaks, once.~~ Done, 2S8-SEC-05: clean (see [Secret scan](#secret-scan)).
