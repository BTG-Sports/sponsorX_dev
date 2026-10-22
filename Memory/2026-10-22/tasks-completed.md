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
