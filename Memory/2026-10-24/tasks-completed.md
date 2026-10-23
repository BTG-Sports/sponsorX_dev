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
