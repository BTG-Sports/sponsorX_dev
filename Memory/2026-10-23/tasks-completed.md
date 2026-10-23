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
