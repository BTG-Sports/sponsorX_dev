# 2026-10-24

## Zoho production key: owner is now rcfworks (decision)

- **Found while checking Zoho One** (Admins → Service Admins): `rcfworks@gmail.com` (Bob) is a Service Admin for CRM, Analytics, Bookings and Books in iCARRe Foundation. It is not an organisation admin.
- **Rodney's "add infinex1" attached the address to `rcfworks`'s own account** as a second sign-in address, which the user confirmed. infinex1 is therefore not a separate Zoho user.
- **Owner's decision:** the production Zoho key is owned by `rcfworks`. Recorded in `SponsorX-Zoho-Credentials-and-Sandbox.md` §9, with the trade-off. Production will still get its own refresh token, for the Production org `4857533000000020005`.
- **Also today:** the Zoho access guide (artifact `9XsaNZL6UxCs4za2YQadVp`) was exported to `~/Desktop/Add-infinex1-to-BTG-Zoho.pdf`. Claude.ai public sharing is greyed out for the organisation.
- **Still open:** whether to switch on the production Zoho sync now or at go-live. It's a go/no-go switch (P2-OPS-04).
- **Owner's decision: Stripe is pending and gates go-live; Zoho production switches on with it.**
  - Stripe still waits on Rodney's identity verification, and the live key was cancelled 2026-10-22.
  - The production Zoho grant is made at go-live, not now, so no unused production token sits around.
  - `SponsorX-Go-No-Go-Review.md` go-live switches updated: Payments pending; Zoho waits for Stripe (owner rcfworks); edge key and Resend done 2026-10-23; production check partly done.
  - Still to do: MFA (Clerk Pro), `GEOLITE2_CITY_PATH`, Stripe tax reporting, `BTG_POSTAL_ADDRESS`, the rest of the production check and the signatures.

## Zoho production switched on (P2-OPS-04)

- **The owner changed the decision: switch Zoho on now, not with Stripe.**
- **The grant:** from the `rcfworks` Self Client (Generate Code → CRM → **Production** ICARRe Foundation), exchanged here. It resolves to org `4857533000000020005` (zgid `749122837`), acting as rcfworks with the Administrator profile; `settings/modules` returns 200.
- **Production api settings:** `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` (the same Self Client as staging); `ZOHO_REFRESH_TOKEN` (production's own); `ZOHO_EXPECTED_ORG_ID=4857533000000020005`; a new `ZOHO_NOTIFY_TOKEN`; a new `ZOHO_NOTIFY_CHANNEL_ID`; and `ZOHO_NOTIFY_URL=https://sponsorx.net/api/v1/webhooks/zoho/crm`. Redeployed 06:44 UTC. Set in manual mode.
- **Checked:**
  - the worker logged `zoho.watch {"renewed":true}`;
  - health ok, queue depth 0, no failures in 24 hours;
  - no Zoho errors.
- **Intelligence fields:** `SponsorX_Renewal_Score` and `SponsorX_Next_Action` were created on Accounts in the production CRM.
- **Bug fixed:** `zoho-intel-fields.mts` treated only the zgid as production, but `ZOHO_EXPECTED_ORG_ID` holds the org id, so the `--confirm-production` guard never fired. It now accepts either id.
- **Clean-up:** the keys file and the temporary token were deleted, and the clipboard cleared.
- **Go/no-go:** Zoho is marked Done. Going live now waits on Stripe, plus MFA, geography, tax reporting, the postal address, the production check and the signatures.
