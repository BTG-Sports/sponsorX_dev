# 2026-11-11 — tasks completed

### Go-live checks: switches, Stripe tax forms, Clerk MFA (rcfworks), on `docs/P8-PMO-06-wrap-2026-11-03`

Part of `P8-PMO-06` (go/no-go) and `P2-OPS-04` (production settings).

- **Stripe account unchanged (checked 2026-11-04).** Rodney said he had "restarted" the Stripe account. The production key `rk_live_…QB13` still belongs to BTG, `acct_1UNCupGfl3hcz7a8`, and all three live webhooks are active at `https://sponsorx.net/api/v1/webhooks/payments/stripe` with no errors. The team's Stripe login sees only that one live account. herseyblack@hotmail.com opened that account on 2026-11-09 (Security history).
- **Stripe tax forms: done, confirmed by Rodney.** The team's Stripe login isn't an Administrator: Team and security → Team says "You don't have permission", so it can't open Connect → Tax forms. The restricted key can't read tax settings, and Stripe has no API for the 1099 settings. Recorded as confirmed by the owner, not seen. A screenshot of Connect → Tax forms → Settings from Rodney would make it seen.
- **Reward switches on, staging then production.** `REWARD_STAFF_CODE_REQUIRED=on` and `REWARD_FAN_CODES=on` (`POL-BE-07`/`08`; screens `POL-FE-07`/`08` shipped 2026-10-29).
  - **Staging test** on reward `cmvoute7z00820cppdcfijfko`, through the API in the `api` container (seven checks, all as expected):
    - two claims on the shared athlete QR got two different codes of their own;
    - redeeming the shared QR is 409 `claim_first`;
    - no staff code is 403 `staff_code_required`; a wrong one is 403 `wrong_staff_code`;
    - the right code redeems (201), and undo is 200.
  - **Fan page on staging web** shows "This code is yours alone", the staff code field and "Staff: redeem now", with 0 scripts.
  - **Production:** api redeployed (`48889001`); `/health/ready` reports db, redis and storage ready. Production has no campaigns, so no fan was affected.
- **The frontend has no switches of its own.** It reads only `API_URL`, `NODE_ENV`, `SPONSORX_EDGE_KEY`, `NEXT_CONTACT_EMAIL` and `CLERK_CLOCK_SKEW_MS`. The pay, payout and fan screens follow what the API reports, and the sign-in URL is fixed in code (`layout.tsx`).
- **Payments switch still off.** There is no `PaymentSwitch` row in production. With no row, `payment-switch.ts` defaults to closed where `RAILWAY_ENVIRONMENT_NAME=production`, and to open elsewhere, which is why staging's `/admin/payments` shows "Open" (screenshot taken there as the test BTG Admin). Only a BTG Admin can turn it on at `/admin/payments`.
- **Two more production BTG Admins (owner's request).**
  - **infinex1@icarrefound.org:** a `BTG_ADMIN` row in `tenant_btg`, linked to its existing live Clerk login (password sign-in).
  - **infinex2@icarrefound.org:** a new live Clerk login with a random temporary password, plus a `BTG_ADMIN` row. It was emailed from noreply@sponsorx.net ("Your SponsorX admin account": sign-in link and password); Resend accepted it. This is the same method as the 2026-10-29 admins, and the password was never printed.
  - Both are recorded in `AuditLog` as `user.grantAdmin`.
  - Production now has five BTG Admins: rcarr@icarrefound.org, chantelle.rotor@gmail.com, chantelleicarre@gmail.com, infinex1 and infinex2. Staging already had both infinex accounts as BTG Admins.
- **Clerk MFA.** Rodney gave the go-ahead. Clerk's Backend API doesn't report the plan (`/v1/instance` has no plan field), so Pro isn't confirmed. None of the four production users has two-step sign-in turned on. SponsorX has no MFA setting of its own: requiring it for admin roles (`P2-INT-02`) is Clerk configuration, plus code if it must be per role.
- **Production is on the latest code.** `release` = `main` (`80980364`, 2026-11-03); the daily deploys since had nothing new.
- **Staging secret exposed.** A switch read printed staging `api`'s `STANDIN_PROVIDER_SECRET` into the session. It's staging-only and unused while staging runs `stripe`. A rotation was blocked by the permission check, so it is still to rotate: set a new random value on staging `api`.
- **Docs:** `SponsorX-Switches.md` (reward switches on/on, reviewed 2026-11-11), `SponsorX-Go-No-Go-Review.md` (tax forms done, MFA status, where it stands).

### Clean pass raised: POL-FE-37…40 (rcfworks), on `docs/POL-37-41-clean-pass`

- **Found on the go-live check.** The user spotted a developer note on `/admin/finance` ("Payout actions are blocked on the written Phase 1 payment policy (§37 gate one…)"). A scan of the text people see, in the code production runs, found about 180 such lines on 45 pages, in four kinds:
  - wrong now (payouts blocked, counsel blocking acceptance, no checkout until Phase 2, payouts outside the platform);
  - sample figures shown to signed-in people whose role can't read a desk;
  - section signs, task IDs and internal words;
  - "Not built yet" / "not wired" labels.
- **Split by the user's choice, one owner per page so no file is edited twice.**
  - `POL-FE-37` (money and operations screens) and `POL-FE-38` (athlete, campaign and agreement wording): **rcfworks**. This is frontend work, an exception agreed 2026-11-11.
  - `POL-FE-39` (public pages, menus, the `/map` route map) and `POL-FE-40` (admin desks, sponsor and NEXT screens): **HeckerCreatives**.
  - All four are Ready on the Polish sheet (rows 58–61). The Status list, colour rules and filter were extended to row 61, and the sheet's count now reads 57 tasks.
- **Plan:** `documentation/polish.md` section F, with "What is true now" to write to and a shared "Done when".
- **Scanner:** `scripts/ui-copy-scan.cjs`. Run `node scripts/ui-copy-scan.cjs [folder]`; it exits 1 while anything is found. It found 178 lines in 84 files on 2026-11-11. It doesn't catch text built in expressions, such as the payment switch's placeholder examples, which are listed by hand.
