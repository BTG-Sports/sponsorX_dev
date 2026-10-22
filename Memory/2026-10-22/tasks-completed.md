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

## The approved wording on every page: P8-FE-08 (Code review), P8-FE-07 (In progress)

- **Trigger:** after #286 merged, the user asked for every page still carrying its own copy of the old wording to be replaced now. This is an explicit exception to the backend-only rule, scoped to these screens. No one else's branch touched them.
- **/join (P8-FE-07):**
  - The page reads `GET /public/agreements/collab` and shows the v2 body verbatim in a `<pre>`, with "· version n" and the approved line "I have read and accept the SponsorX Athlete Content Collaboration Agreement (version n)."
  - The application now sends `agreement: { agreementId, bodyHashShown }`, so the acceptance is recorded.
  - A tick only counts for the agreement on screen (`acceptedAgreementId` in the draft). If the text can't be loaded, submission waits. The "Draft" badge is gone.
  - **Still open:** the portal prompt and the `requireCollabAcceptance` switch.
- **Fan page (P8-FE-08):**
  - Shows `notice` and `eligibilityCheck`, and the label "(optional — you can claim without it)".
  - Privacy link to the new fan route `/r/privacy`. It's a static segment, so it wins over `/r/[token]`, and it renders `GET /public/fan-privacy`.
  - Unsubscribe page: "You're unsubscribed. We won't email you again about this reward, and we've told the sponsor to stop too."
- **Guardian pages:**
  - Both use the approved line "I am X's parent, legal guardian or authorised representative. I have read and accept the SponsorX Guardian Agreement (version n) on their behalf."
  - **Handoff page bug fixed:** it showed a hard-coded placeholder agreement ("[Remaining terms from counsel]") while the backend recorded the real version. The backend now adds `agreement: { version, body }` to `GET /public/guardian-handoffs/{token}`.
  - The tenant-isolation seed pre-registers GUARDIAN too.
- **Sponsor screens:**
  - "ROI" is gone from the report title, the export filename, the campaign page (five lines), the back link, the packages page and the dev map.
  - The approved confidence caption is used.
  - The results foot note (`RESULTS_NOTE` in sponsor-intelligence-live.ts) is at the foot of the results hub and the campaign report.
  - **Left as is:** the home page's "measurable ROI" marketing line, and the sample-only PDF export's demo "return multiple".
- **e2e:** the /join checkbox regex is updated in `loop-p3-application` and `marketplace-path`.
- **Run locally, all passing:**
  - backend and frontend builds, lint, security scripts, secret scan and audit check;
  - frontend 1,595 tests and backend 3,509 tests;
  - the e2e specs `redeem-flow`, `public` and `public-links`: 15 passed, 1 skipped. The loop specs need Clerk, so CI runs them.
- **P8-FE-08 is Done.** It merged in #287 with all four checks green, including the Clerk loop e2e through the new /join agreement step.

## Railway → Slack deploy alerts: pause attempted, refused

- The user asked to pause Railway's webhook to Slack (#deployment).
- **Railway's API now exposes project webhooks** as notification rules, unlike on 2026-09-23. The Slack one is rule `dd9f0096-6c26-49d1-858d-88b136ba1acd` (whole project, both environments).
- **Its event types, to restore later:** `Deployment.crashed`, `.failed`, `.deployed`, `.redeployed`, `.building`, `.resumed`.
- **There's also a stray rule** `2ad75004-…` with eventTypes `__probe_invalid__` and no channel. It's harmless.
- **The pause failed:** `notificationRuleUpdate` with `eventTypes: []` was refused with "Not Authorized". The infinex1 CLI login (OAuth `accessToken`) can read rules but not change them. The CLI's `token` field is refused even for `me`. Nothing was changed.

## Secret rotation: started on staging, then paused (owner: no Railway until its incident is fixed)

- **Staging, set but not deployed (`--skip-deploys`):** new random values for:
  - `INTAKE_TOKEN_SECRET` (no `_PREVIOUS`, because of the leak);
  - `SPONSORX_EDGE_KEY` (api and web match);
  - `INFINEX_SIGNING_SECRET` and `STANDIN_PROVIDER_SECRET`;
  - the tester's `TESTER_SESSION_SECRET`.
  - Running services still use the old values. **The next staging deploy applies them.** Links emailed before that stop working (expected after a leak), and tester sessions end once.
- **The staging deploy was started, then cancelled** when the owner said not to use Railway until its problem is fixed. The queued api deployment was cancelled; api and web still run the 2026-10-21 release.
- **Production: nothing changed.** Writing production secrets is blocked by Claude's permission classifier. It needs the owner to set them, or to add a permission rule.
- **Still to rotate**, owner in each vendor dashboard: Resend; Clerk live and test; R2; Stripe test keys and webhook secrets; Zoho; the GitHub monitor token; the database and Redis passwords.
- **Sync PR #289** (main_development → main, the legal wording) is open and merges cleanly.
- **Railway status at 10:15 UTC:** Major Outage. Builds are back for Pro and Enterprise only (our workspace is Pro).
