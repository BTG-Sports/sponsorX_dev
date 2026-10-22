# 2026-10-22

## 🚨 URGENT: Railway security incident, rotate every secret when Railway builds resume

**What happened (21 Oct 2026).** Railway found that an unauthorized party reached the system holding customer environment variables, and may have decrypted some of them. Railway tells every customer to rotate every secret stored on Railway. See the [security notice](https://blog.railway.com/p/security-disclosure-wednesday-october-21st) and the [incident page](https://status.railway.com/incident/QH8L8B3E). Railway is emailing the accounts it confirms were affected. Deployments are paused platform-wide, so a new secret can't take effect until builds resume.

**Already done (22 Oct).**
- **Stripe live key cancelled.** `rk_live_...QVaC` ("SponsorX production (restricted)") is expired, and Stripe returns 401 "Expired API Key". Suspicious API activity showed nothing. Live mode has no charges, refunds, payouts or checkout sessions. No live secret key exists now; create a new one at go-live.
- **GitHub token revoked.** The staging `monitor-trigger` `GH_DISPATCH_TOKEN` (fine-grained, owner infinex1, ending `Faen`) was revoked via GitHub's `/credentials/revoke` and returns 401. Workflow dispatches since 20 Oct are only our own deploys and the health monitor. The staging health monitor is stopped until a new token is made.
- **Databases and Redis are private.** None has a public TCP proxy or domain, so their leaked passwords can't be used from outside Railway.
- **No AI provider keys** are stored on Railway.

**Still exposed: rotate as soon as Railway builds resume (owner's decision 22 Oct: rotate on resume, not before).**

| # | Key | What someone could do with it | Where |
|---|---|---|---|
| 1 | **Resend** | Send email as `sponsorx.net`, e.g. phishing that looks like ours | production and staging `api` |
| 2 | **Clerk live secret** | Read or change production user accounts and sign-ins | production `api` and `web` |
| 3 | **Cloudflare R2 storage keys** | Read or delete uploaded files, including signed agreements | production and staging `api` |
| 4 | Zoho sandbox, Stripe **test** keys, INFINEX and stand-in secrets, tester passwords | Test and sandbox data only | staging `api`, `tester` |

Also rotate our own signing secrets (`SPONSORX_EDGE_KEY`, `INTAKE_TOKEN_SECRET`, `ZOHO_WEBHOOK_SECRET`, `TESTER_SESSION_SECRET`), the Clerk test secret, the Stripe webhook secrets, and the database and Redis passwords.

**Order of work once builds resume.**
1. Create the new key at each vendor, keeping the old one working.
2. Set the new keys on Railway (staging and production).
3. Redeploy staging and production.
4. Revoke the old keys.
5. Change the database and Redis passwords, and redeploy the four Postgres services. This also restarts their backups (below).
6. Make a new GitHub token for the staging health monitor.
7. Deploy the pending web release (P8-OPS-03, below).
8. Before rotating 1 to 3, check their activity since 21 Oct: Resend's sent-email log, Clerk production users and sign-ins, and R2 bucket access.

**Backups are failing until then.** pgBackRest to the Railway bucket `t3.storageapi.dev` fails with 403 on all four Postgres services (staging and production, main and warehouse), because Railway revoked all bucket credentials. Nothing is down, and the disks are at most 5.1 GB of 50 GB. But point-in-time restore isn't possible for this window. Railway has issued new bucket credentials; the databases pick them up when redeployed.

## Staging check: web is one release behind (waiting on Railway)
- API staging is current: `/health` 200, and the three webhook paths answer 401 directly.
- Web staging runs `e265e57` (PR #278). Main `2630209` (PR #280, P8-OPS-03 webhook forwarding) never deployed: the `release` push landed while Railway was down, so the webhook paths still return 404 through web.
- `railway redeploy --from-source -s web -e staging` was refused with "Paused temporarily". Railway's status page shows a platform outage, with builds paused.
- Railway CLI re-signed in as infinex1@icarrefound.org.
- Decision (programme owner): wait for Railway, no image workaround. When builds resume, redeploy web staging, check the webhooks answer 401, then production with approval.

## Legal wording approved, and issued in the app as v2 (P8-BE-07, Done)

- **Trigger:** the user said the drafts in the SponsorX Legal folder (Drive `1vA-ZbjgCjQ59_i05lo7_HUGPVZD1CZ0B`, documents 1–7) are all approved, and asked for them to be used in the web app. They approve with Rodney's delegated authority.
- **Legal rows closed (Legal sheet, Done 2026-10-22, rcfworks):**
  - Phase 1: P0-LEG-01 to P0-LEG-06.
  - Phase 2: 2S0-LEG-01 and 2S0-LEG-02.
  - Phase 3: 3S0-LEG-01.
  - **P0-LEG-03's answer** is click-to-accept by a verified guardian (Option A); no e-sign vendor.
- **How the counsel blanks were filled:** with what the product already does, as the user approved.
  - Payment within 30 days.
  - Nothing owed on cancellation.
  - No revision cap; a post stays live for the campaign window.
  - No indemnities.
  - Records kept 7 years.
  - 30 days' notice of fee changes.
- **Governing law** is left out of v2, because BTG hasn't named it. Adding it later is v3, and everyone re-accepts.
- **BTG's postal address** is unknown, so it is `BTG_POSTAL_ADDRESS`. Until that is set, the fan email footer and privacy notice leave the address line out. It's listed as a go-live switch in the go/no-go review.
- **Fan email retention:** the fan privacy notice says 90 days, because P8-BE-05 already deletes fan emails 90 days after the claim.
- **What changed (backend only):**
  - **New agreement files:** `backend/agreements/{COLLAB,CAMPAIGN_ORDER,GUARDIAN,PROPERTY_TERMS,MARKETPLACE_ORDER}.v2.txt`. The Guardian Agreement is one term per line, as the guardian page parses it.
  - **Registration:** `registerFileVersion` (current-agreement.ts) registers the newest file on first use. It's now called by the Campaign Order loaders (offer.ts, campaigns.ts `readOrder`), order-terms.ts, onboarding.ts and guardian-handoff.ts. Response shapes are unchanged.
  - **Property terms fingerprint:** v1 rows keep their plain-hex fingerprint. v2 uses the shared `sha256:` form.
  - **Fan consent:** both boxes re-versioned `2026-10-22`. Box 2 names the reward's sponsor (`sponsorContactText`). The public reward view adds `notice` and `eligibilityCheck`.
  - **Fan privacy notice:** served at `GET /public/fan-privacy`.
  - **Fan email footer:** `fanFooter` in send-email.mts.
  - **Report:** "Campaign Results Report", "Cost per 1,000 checked views" and `RESULTS_NOTE`.
- **Tests:**
  - New: `approved-legal-wording.test.ts` and `tests/support/agreements.ts` (`versionInForce`, `agreementHash`).
  - Suites that pinned v1 or the old consent version now read the version in force.
  - The tenant-isolation seed pre-registers the three newly self-registering kinds, as it already did for COLLAB.
- **CI run locally, all passing:**
  - build, lint, security scripts, secret scan and audit check;
  - backend 232 files, **3,509 tests**, 0 skipped.
  - Docker isn't installed on this Mac. A portable Postgres 17.11 (zonky binaries) ran from the session scratchpad on port 5433, with its socket in `/tmp/sxpg`.
- **Frontend split (backend-only rule):** `P8-FE-08` (new, Ready) covers:
  - the fan page's notice, eligibility line, email label and privacy link;
  - the unsubscribe confirmation;
  - the guardian acceptance box;
  - the results screen's labels and title.
  - `/join` showing the v2 agreement is the existing `P8-FE-07`.
- **Docs:**
  - Phase 1, 2 and 3 plans: the LEG tasks are marked ✅. P8-BE-07 and P8-FE-08 are added.
  - Go/no-go review: both pilot gates are recorded as met 2026-10-22, still unsigned, with the address and governing-law switches added.
  - CLAUDE.md: the open decisions are moved to Decided.
- **Tracker:**
  - The 9 legal rows are Done.
  - P8-BE-07 (Done) and P8-FE-08 (Ready) are added at Order 157.79 and 157.94.
  - Phase 1's filter, conditional formatting and status list are extended to row 318.
  - Stage Progress snapshot for 2026-10-22: 298 done, 23.5 days left.
- **Not deployed:** Railway deploys are paused (security incident above). This ships with the next staging deploy.
- **The Drive drafts** still carry their "DRAFT for counsel review" headers. Retitling them is the user's to do; the files weren't touched.
