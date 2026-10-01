# 2026-10-01 — tasks completed

## Landing: the logo's orange joins the type — owner's preference, via Claude

The landing (`/`) was blue throughout. The owner asked for an orange theme in
the fonts, taken from the logo. The lockup's colours are blue `#2E9BF5` and
orange `#F97A1F` (the X bolt and "BRAND IMPACT"), per
`documentation/Design/marketing-visuals/exports/logos/README.md`, and the
tagline reads blue-then-orange — so that split is the rule on every stop:
the headline's single highlighted word stays blue (or the athlete stop's cyan)
and its closing phrase takes the orange. Type only; buttons, HUD frames, icons
and rings stay blue.

- `globals.css` — `.sx-hero-gradient-accent`, the orange twin of the blue
  headline gradient (`#ffd1a6 → #fb923c → #f97a1f`, same clip and drop-shadow).
  The white `.sx-hero-shimmer` band works on it unchanged. Dark literals on
  purpose: the city under the landing is dark in both themes.
- Hero — "Reward Fans." in the orange gradient (no shimmer; "Measure Results."
  keeps the blue one and its shimmer). Platform strip — the "THE PLATFORM"
  label, its rule and "grow." in `#fb923c`.
- How it works — `works` in `#fb923c` (the stop has no second line).
- For sponsors — "Real Measurable Impact." orange; "Partnerships." stays blue.
- For athletes — "Build Lasting Partnerships." orange; "Athletes." stays cyan.
- Join the movement — "Real Partnerships." orange.

Verified: `npm run build` (frontend) green, ESLint and `tsc` clean on the
changed files, and the five stops screenshotted at 1440×900 from a production
`next start` with Playwright — orange reads on every headline, nothing wraps.
`/packages` and `/join` still use the blue `.sx-hero-gradient`; they were not
touched (the ask was the landing) and are the natural next place for the same
split if the owner wants it.

Not a board task — a polish request — so no tracker row.

## /packages and /join follow the landing's orange — owner's preference, via Claude

Same rule as the landing, same class. `packages-stage.tsx`: hero line three
"You Measure Impact." in the orange gradient under the blue "We Match
Athletes."; every section head's accent phrase (`SectionHead`'s `accent`) and
the CTA band's "We'll build the lineup." take `.sx-hero-gradient-accent`.
`join-stage.tsx`: "Your Sponsors." orange under the blue "Your Game."; the CTA
band's "Every campaign after it." orange. Eyebrows stay blue (they come first;
the orange is the closing phrase). Build, ESLint and `tsc` green; both pages
screenshotted at top, middle and CTA band. The landing paragraph above no
longer applies where it says these two pages were untouched.

## Plaza hologram: the 3D X is now the logo's X — owner's preference, via Claude

The hologram above the plaza pedestal was a generic two-bar X in primary blue.
The owner asked for the logo X's colour style. `pedestal.tsx` now extrudes the
two polygons of `sponsorx-x-dark.svg` — the orange lightning bolt (left,
`BRAND.orange`) and the white chrome blade (right, `BRAND.white`, lower
emissive, a little metalness) — to a 3D letter with the lockup's 8° italic
lean (a shear on the geometry). Same size, depth, lift, spin, bob, scan lines
(one shared alpha map, scrolled through the bolt material's ref — the linter
forbids touching it through the props) and edge outlines (bolt `#ffc48a`,
blade white). Rings, dais and projector cone stay primary blue, so the plaza
carries the brand's three colours. Collision boxes and `VENUE_DIMS` unchanged;
the city layout and venue-box tests pass (34). Build, ESLint and `tsc` green;
two hero frames screenshotted a couple of seconds apart show the bolt and
blade from two angles as it turns.

## Fixed in passing: the frontend build was broken locally

`next build` failed with `Module not found: Can't resolve 'rimraf'` from
exceljs → unzipper → fstream (the athlete earnings export). The root
`node_modules/rimraf` folder existed but was empty (timestamp 2026-09-30 21:22;
something had hollowed it out). `npm install` restored rimraf 2.7.1 from the
lockfile — no lockfile or package.json change. If your build shows the same
error, run `npm install` at the root.

## GitHub Actions cut to once a day; deploys at 8 pm Manila

- **Why.** GitHub Actions stopped starting jobs on 2026-09-30 at 09:19 UTC: "recent account payments have failed or your spending limit needs to be increased". CI ran on every push and every pull request — about 10 minutes a run, and 82, 56 and 41 runs on 28, 29 and 30 Sept — against 2,000 included minutes a month. The user can't pay for now and will wait for the monthly reset.
- **CI (`ci.yml`).** Now runs once a day at 12:00 UTC (8 pm Manila) on `main`, or by hand. It no longer runs on pushes or pull requests: not on working branches, not on `main_development`, not on `main`. A first `changed` job skips the heavy jobs when `release` already equals `main`. Estimated ~300 minutes a month.
- **Deploy (`deploy-daily.yml`, new).** Triggered when CI completes successfully on `main`. If both CI jobs passed on that commit, it force-moves the `release` branch to it. Railway, watching `release`, deploys `api` and `web` to staging and production. It never writes to `main` and needs no Railway key. That design was chosen because the Railway CLI login is "Not Authorized" to create project tokens, but can update deploy triggers.
- **Manual deploys are unchanged:** Railway's buttons, or `npm run deploy`.
- **Tracker.**
  - `tracker-notify.yml` is now "Tracker sheet sync": `notify --no-slack` updates the Google Sheet on every tracker change on `main` and posts nothing to Slack.
  - `tracker-digest.yml` now runs every day at 8 pm Manila (was weekdays at 9 pm), and the digest lists every task change since the previous evening ("What changed").
  - The tracker tests now pass at 19.
- **Railway, not done yet.** After this lands on `main`: create `release` at `main`, then point the four deploy triggers (staging and production × `api` and `web`) at `release`. Trigger IDs: staging 577b3a24…, fa327cb5…; production 831bd597…, c9ddcb18….

## User-flow review: seven tasks raised (Phase 2 is now 82 tasks, 317 days)

**Gaps found in the 16-step story:**
- A team can't add an athlete who already applied: "add to roster" refuses an email that already has an account.
- Sellers have no sight of their sales and get no email: marketplace orders are readable by the sponsor and BTG only.
- Only BTG can mark an order delivered.
- Orders close only by hand.

The user agreed the recommendations and set the sponsor's confirmation window to **24 hours**.

**Raised:**
- **2S2-BE-05** (4d, Ready): a team invites an existing athlete with a proposed share; the athlete accepts or declines.
  - Accepting links them and ends the athlete's own listings.
  - Either side can end the link; past orders keep their split.
- **2S2-FE-05** (3d, Blocked): the screens for that.
- **2S4-BE-06** (3d, Ready): sellers read only their own order lines and share.
  - They're emailed when a sale is approved and paid.
  - The sponsor contact is shown once paid.
- **2S4-BE-07** (5d, Ready): delivery is confirmed per line.
  - A paid order moves to In delivery automatically; the seller marks it delivered with a note.
  - The sponsor confirms or reports a problem; 24 hours of silence confirms.
  - Only confirmed lines are payable, and a problem holds that line's payout until BTG decides.
- **2S4-BE-08** (2d, Ready): a daily job sends overdue reminders, lists overdue lines for BTG, and closes an order 30 days after its last line is confirmed, which releases the reserve.
- **2S4-FE-03** (3d, Blocked): the seller's Orders page, in both the athlete and team portals.
- **2S4-FE-04** (4d, Blocked): the delivery screens for the seller, the sponsor and BTG.

## BTG admin review: organizations approved automatically (5 tasks; Phase 2 is now 87 tasks, 331 days)

- **The decision.** The user listed every BTG intervention; the table is in Google Drive at Process / "BTG Admin Interventions". The user decided that organizations are approved automatically: BTG has at most one reviewer, so we push automation.
- **The rules:**
  - Required documents are ticked automatically.
  - The contact must confirm their email.
  - The organization name is unique platform-wide, compared ignoring case, spaces, punctuation, a leading "The" and LLC/Inc. The database enforces it, and pending applications count.
  - BTG admins are emailed for every new organization with a link to its profile page.
  - **Reject** after approval switches off login and listing access, ends listings, holds payouts and emails the reason. BTG can reinstate.
  - Approved organizations can update their documents from their portal.
  - New organization type: **AGENCY**.
- **Raised:**
  - **2S1-BE-06** (5d): automatic approval, unique names, email confirmation, the BTG email and Reject.
  - **2S1-BE-07** (2d): document updates after approval.
  - **2S1-BE-08** (2d): the AGENCY type.
  - **2S1-FE-04** (3d): the applicant's checklist and the Documents page.
  - **2S1-FE-05** (2d): BTG's organization profile page with Reject and an "Automatically approved" list.

## BTG admin review: athletes and guardians approved automatically (8 tasks; Phase 2 is now 95 tasks, 362 days)

**Decided with the user:**
- **Adults** are approved automatically. Needed: a government ID, a confirmed email, a complete application (date of birth now required) and no likely duplicate.
- **Minors.** A school ID or similar for the minor. The guardian's own page collects their details, a government ID, proof of guardianship and the guardian agreement. Both emails must be confirmed, then approval is automatic.
  - **The guardian's account does every agreement and money action.** The minor can upload content, and the guardian is emailed for each upload.
  - Rejecting a guardian rejects all their athletes, not the reverse.
- **BTG** is emailed for every automatic approval, with a link to a "New sign-ups" page offering Reject and Reinstate.
- **Age of majority** follows the athlete's state or country, from an editable table. Unknown places count as 18 and are flagged.
- **Coming of age:** a 90-day allowance with a persistent reminder; after that, new listings and payouts pause until a government ID is uploaded.
- **Files** are kept in the private R2 bucket (5-minute audited views for BTG admins), retained 30 days after an account closes, with reactivation within those 30 days.

**Assumptions stated to the user:**
- The pause after the 90 days.
- A rejected account can only request reactivation; BTG decides.
- A staff-confirmation setting for minors, so the open guardian e-signature legal question needs no rebuild and doesn't block the build.

**Raised:**
- Backend: **2S1-BE-09** adults (4d), **2S1-BE-10** minors and guardians (5d), **2S1-BE-11** the guardian acts for the minor (5d), **2S1-BE-12** age of majority and coming of age (3d), **2S1-BE-13** close, retention and reactivation (3d).
- Frontend: **2S1-FE-06** sign-up screens (4d), **2S1-FE-07** New sign-ups page (3d), **2S1-FE-08** guardian controls, the coming-of-age reminder and close/reactivate (4d).

## Coming-of-age rules set (2S1-BE-12 is now 4 days)

The user set the 90-day rules:
- During the allowance, neither the athlete nor the guardian can add items or start new transactions. Existing orders and campaigns continue.
- Reminder emails go out at the start and 30, 14, 7 and 1 days before the end.
- If the government ID still isn't uploaded after 90 days, both accounts are terminated.
  - My assumption: if the guardian has other minors, only the guardian's link to this athlete ends.
  - The 30-day retention and reactivation rules apply.
  - In-flight items go to BTG, and earned money stays owed.

## Profile edits: no more BTG review (2 tasks; Phase 2 is now 97 tasks, 368 days)

- **2S1-BE-14** (3d, Ready) replaces P3-BE-16's review of every edit.
  - Ordinary edits publish at once.
  - Sensitive edits also publish at once but re-run the sign-up checks: a legal name needs a matching ID, a date of birth recomputes adulthood, a new guardian goes through the guardian's page.
  - BTG is emailed only for sensitive edits.
- **2S1-FE-09** (2d, Blocked): the editor's screens; the Profile changes page is retired.

## Guardian handoff and BTG support (4 tasks; Phase 2 is now 101 tasks, 377 days)

**The user's rules:**
- A handoff starts only with the new guardian's request. The current guardian then approves it with Hand off, or declines; they can't start a handoff alone.
- The current guardian keeps control until the switch.
- Agreed work and earned money stay where they were.
- A guardian with other children keeps them.
- **A disputed guardianship is never automated:** the new guardian contacts BTG through a support email and contact page.

**Raised:**
- **2S1-BE-15** (3d): the handoff.
- **2S1-BE-16** (2d): the contact form, queued to the support mailbox.
- **2S1-OPS-01** (1d): set up the support mailbox. Recommended: Zoho Desk at support@sponsorx.net; awaiting the user's choice.
- **2S1-FE-10** (3d): the handoff and contact screens.

## Sponsors approved automatically, and a restricted-words check (3 tasks; Phase 2 is now 104 tasks, 387 days)

**The user's rules:**
- Sponsors are automatic except: restricted business types, "Other" descriptions with negative or illegal words (sex, drugs and so on), and name matches. Those go to BTG.
- The business type comes from a fixed list, or "Other" with a typed description.
- Proof of business (registration, permit or license) is required of every sponsor, the same everywhere.
- The word list lives on the server and BTG can edit it.

**Raised:**
- **2S1-BE-17** (4d): sponsor auto-approval.
- **2S1-BE-18** (3d): the restricted-words check. It's hard to get around, matches whole words, only routes to review, and is reusable.
- **2S1-FE-11** (3d): the form changes and the word-list admin page.

## Built: 2S1-BE-18 and 2S1-BE-17 (both at Code review, rcfworks)

**2S1-BE-18, the restricted-words check** (commit b99df00):
- Each tenant has its own list, seeded with starter words the first time it's used.
- Matching is in `domain/restricted-words-rules.ts`. It ignores case and accents, undoes letter swaps, joins spaced-out letters, matches whole words, and matches plurals.
- BTG admins manage the list at `/restricted-words`: list, add, remove (the word is deactivated, not deleted), `/test`, and `/history` (read from the audit log).
- Other features call `checkRestricted(tx, tenantId, text)`.

**2S1-BE-17, sponsors approved automatically:**
- **The form.** `/public/inquiries` takes `businessType`: a brand category, or OTHER with `businessTypeOther`. It emails a confirmation link (`sponsor.confirmEmail`) and returns a `requestToken`. Public routes under `/public/sponsor-requests/…`:
  - the status;
  - the proof-of-business upload and confirm;
  - `confirm-email`.
- **The tokens.** There are two HMAC tokens with separate purposes. The browser's token can never confirm the email.
- **The checks.** `evaluateSponsorRequest` runs after each upload and after the email is confirmed. It approves the request (same transaction as a manual approval; the audit row has no actor), sends it to review with `reviewReasons`, or waits. A request goes to review for:
  - a restricted type;
  - restricted words in an Other description, or an Other description that sounds like a restricted type;
  - an email that already has a login;
  - a same-named sponsor. Names are compared with `normalizeBusinessName`, which ignores case, punctuation, "The" and endings like LLC or Inc.
- **Email to BTG.** BTG admins and sales get `sponsor.newSponsor` for every new sponsor, with a link to `/admin/sponsor-requests/:id`.
- **New decisions.** REJECT applies to an approved sponsor: all its logins get `disabledAt`, sign-in returns 403 `account_disabled`, and `sponsor.accountRejected` is emailed. REINSTATE switches the logins back on.
- **Viewing proofs.** BTG opens a proof through a 5-minute audited link (`SENSITIVE_DOCUMENT_TTL_SECONDS`). Storage caps any TTL at 15 minutes.
- **Tests.** `tests/phase2-sponsor-auto-approval.test.ts` has 16 tests. The full suite passes 1954 of 1955; the only failure is the old QA-02 reservations test.
- **Frontend still to do.** The form must send `businessType`. Until it does, requests wait for BTG as before.

## Built: the 11 new screens from the Claude Design canvas, plus the sponsor form (rcfworks)

**Design:** canvas RNykbEaHgkiMppTXandrrB, files `project/<Name>.dc.html`.

**Connected to the real API:**
- `/admin/restricted-words` (2S1-FE-11).
- `/athlete/listings`, so a no-team athlete lists their own items (2S3-FE-02, on 2S3-BE-05).
- The sponsor form (2S1-FE-11):
  - the brief wizard now asks for a business type from a list, or Other with a description, and its old "Brand category" free-text field is gone;
  - after sending, the proof of business uploads straight to the private bucket;
  - new pages `/sponsor-request/confirm?t=` and `/sponsor-request/<token>`.
- Live parts of otherwise-sample screens:
  - the sponsor section of `/admin/new-signups`;
  - the sign-in email and payout account in Settings.

**On sample data, buttons switched off with the reason and a notice naming the backend task it waits on:**
- `/admin/new-signups`, for organizations, athletes and guardians (2S1-BE-06, -09, -10).
- `/admin/delivery-issues` (2S4-BE-07).
- `/athlete/sales` and `/property/sales`, the seller's Orders (2S4-BE-06, -07).
- `/athlete/team` (2S2-BE-05).
- `/guardian/setup` (2S1-BE-10).
- `/guardian/handoff` and `/athlete/guardian-requests` (2S1-BE-15). The menu link shows to GUARDIAN only.
- `/contact` (2S1-BE-16). The address shows as "being set up" until 2S1-OPS-01.
- `/property/documents` (2S1-BE-07).
- Close, reactivate and coming-of-age in `/athlete/settings` and `/property/settings` (2S1-BE-13, -12).

**Menu, access and icons:**
- Admin menu: New sign-ups, Delivery issues, Restricted words. All three are BTG admin only in `admin-access.ts`.
- Athlete menu: List my item, Orders, Team, Guardian requests, Settings.
- Property menu: Orders, Documents, Settings.
- The footer has a "Contact BTG" link.
- New icons: flag, ban, shield, box.

**Copy we deliberately left out:**
- Team page: "joining ends your own listings". That rule was never agreed.
- List my item: "goes live by itself". BTG approves every listing.
- Profiles and listings don't yet claim the restricted-words check runs on them.

**Backend fixes made today:**
- **2S1-BE-17:**
  - a manual Approve now requires an uploaded proof of business (a second path around the rule);
  - the status read returns the email;
  - confirm-email returns the request token, so the proof can be uploaded from any device.
- **P7-FE-06:** the Operations Board's Content approvals card now counts SPONSOR_REVIEW too. That matches the Approvals page, and a new test compares the two definitions.

**Checks:**
- Frontend: 853 of 853 tests pass, and tsc and eslint are clean.
- Root `npm run build` is clean.
- Backend: 1956 of 1957 pass; the one failure is the old QA-02.
- The public pages return 200 on `next start`.

## Code review rows checked against their acceptance criteria (the user's rows only)

**Moved to Done (27):**
- Phase 1: P4-FE-01, P6-FE-02, P6-ART-01, P1-ART-08, P1-FE-24, P1-FE-25, P1-FE-26, P9-FE-06, P3-BE-15, P3-FE-06, P3-FE-07, P4-FE-07, P7-FE-06 (after today's fix).
- Phase 2: 2S1-FE-01, -02, 2S2-FE-02, -04, 2S4-FE-01, 2S5-FE-02, 2S0-ART-01, 2S7-FE-01, -03, 2S3-BE-05, 2S1-BE-05, 2S1-FE-03, 2S1-BE-18, 2S1-BE-17 (after today's fixes).

**Left at Code review:**
- **2S2-FE-03:** there is no "request a change" action, in the API or on the screen.
- **2S3-FE-01:** the listing editor has no sponsor-view preview.
- **2S4-FE-02:** card payment only works with the stand-in provider, and there's no step where the sponsor accepts an agreement.
- **2S7-FE-02:** disputes, failed payments and payout problems don't show in the marketplace console.
- **2S5-FE-03, -04, -05:** they wait on Stripe (2S0-PMO-03). 2S5-FE-04 also has no test asserting the payout.approve and payout.reject audit rows.
- **4S0-ART-01:** the task says 12 screens, but the canvas has 10. The definition needs a PR, or two screens are missing.

**Not touched:** P1-ART-10, -11, -12 are HeckerCreatives' rows.

**Stage Progress row for 2026-10-01:** 236 done, 60 days left.

## Fixed the failing Code review rows (left at Code review for a second look)

- **2S2-FE-03, "Request a change" on an offer:**
  - The athlete sends `POST /offers/:id/respond` with `REQUEST_CHANGE` and a required note.
  - The request is stored as a new `OfferChangeRequest` (migration 20261001120000) and audited as `offer.requestChange`.
  - The `offer.changeRequested` email goes to the offer's author and every active campaign manager, or to the BTG admins if there are none.
  - A minor needs a verified guardian, the same as for Accept.
  - The offer stays SENT, so Accept and Decline remain. That's because sent terms are immutable: BTG answers a request by withdrawing and re-sending the offer, or by saying it stands.
  - There's no BTG offers screen yet, so the requests are visible on `GET /offers` and `GET /offers/:id`.
- **2S3-FE-01, the listing preview:**
  - New routes `/property/listings/[id]/preview` and `/athlete/listings/[id]/preview` render the listing with the shop's own `ShopListingCard`, which was moved out of the shop page so both use the same card.
  - This also fixed the shop crashing on a listing sold by an independent athlete (`property: null`).
- **2S4-FE-02, the contract gate:**
  - Checkout now runs: review the hold, the billing contact (pre-filled from the primary contact), the order terms (checkbox), then Place order.
  - `POST /marketplace-orders` requires `agreementId`, `bodyHashShown` and `billing`. The server re-hashes the terms and records the acceptance through `acceptAgreementIn`.
  - The billing details and acceptance are stored on the order (migration 20261001130000, with a CHECK pairing the two) and are immutable afterwards.
  - The order record shows on the sponsor's order page and BTG's order page.
  - The terms are `backend/agreements/MARKETPLACE_ORDER.v1.txt`, a draft that counsel hasn't approved.
- **2S7-FE-02, the console:**
  - Failed card payments show through a new BTG-only route, `GET /payments/failed`.
  - Payout problems show with a Retry button.
  - Disputes are still missing, waiting on 2S5-BE-03 (Blocked).

**Deploy notes for staging:**
- After `migrate deploy`, re-apply `backend/prisma/sql/marketplace_order_immutable.sql`, as the runbook's step 4 says.
- The seed tenant gets MARKETPLACE_ORDER v1 from the seed job. Any other tenant needs `npm run agreement:register -w @sponsorx/backend -- <tenantId> MARKETPLACE_ORDER 1`. Without it, Place order stays disabled with a message.

**Checks:** backend 1969 of 1970 pass (only QA-02 fails), frontend 881 of 881, and lint and `npm run build` are clean.

## The 15 backend tasks from the BTG-admin review: built, wired to their screens, and independently reviewed

**How it was done.** There were four groups, each built in its own git worktree from f7232e2, then merged into `development/bob/be_batch_0924`. A separate reviewer agent checked every row's acceptance against the running call paths. Each FAIL was fixed and then re-reviewed. Every Done below passed that review.

### Organizations (a5bcd86, e7bccb7)

**2S1-BE-06: automatic approval.**
- `PropertyOnboarding.nameKey` is UNIQUE and uses `normalizeBusinessName`. Pending applications hold their name, and BTG's manual approval checks the name too.
- BTG is emailed a link to `/admin/onboarding/:id`.
- Reject after approval does all of this: logins off, listing access off, listings archived, `Property.payoutsHeldAt` set, and the reason emailed.
- Reinstate reverses it.

**2S1-BE-07: document updates.** `/property/documents` lets the organization replace and add documents. Earlier files are kept, BTG is told, and listings stay live.

**2S1-BE-08: AGENCY** is an organization type. Its documents are a registration per state, an ID, and a representation agreement. The representation agreement is still to be confirmed by the owner.

**Screens:**
- 2S1-FE-04: the wizard checklist and `/onboarding/confirm`.
- 2S1-FE-05: the profile page at `/admin/onboarding/[id]`, with "Approved automatically" and "Flagged" tabs.

### Teams and orders (a69de3e..f7e4700, 4c7acfd)

- **2S4-BE-06:** sellers see their sales at `GET /sales`, with their own share only. The sponsor's contact appears once paid.
- **2S4-BE-07:** `OrderLineDelivery`. The seller marks a line delivered, and the sponsor confirms or reports a problem within 24 hours. Silence confirms, through the worker's `sweepDeliveries`. BTG resolves problems by confirming or refunding. Payouts release line by line.
- **2S4-BE-08:** overdue reminders, and auto-close 30 days after confirmation.
- **2S2-BE-05:** `TeamInvitation`. The athlete accepts the share, and either side can leave or remove. A team can lower an accepted share but never raise it.
- **Screens:** 2S4-FE-03/-04 (seller Orders, the sponsor's delivery section, BTG's Delivery issues) and 2S2-FE-05 (athlete Team page, roster invites).
- **Two review fixes:**
  - a manual FULFILLED is refused over an unsettled line;
  - the share-raise guard above.
- **Plan wording:** the 2S2-BE-05 definition now says the athlete's own listings stop selling while they are on a team, and sell again after leaving. The earlier "ended" wording didn't match what was built.

### Accounts (08ad1a1, 95df581)

- **2S1-BE-13:**
  - `AccountClosure`: 30-day retention, then `purgeExpiredClosures`.
  - `/reactivate`: a signed emailed link. Self-closed accounts come back themselves; rejected accounts ask BTG.
  - Every Reject path records a closure: organization before and after approval, athlete, guardian, applications desk, declined sponsor request, coming-of-age termination.
- **2S1-BE-14:** profile edits publish at once. Legal name, date of birth and guardian edits re-run the checks and email BTG. The Profile changes desk is retired into New sign-ups → Sensitive edits.
- **2S1-BE-15:** guardian handoff. It starts only with the new guardian, and the current guardian hands off. `POST /athletes/:id/guardian` refuses with 409 `handoff_required` unless a BTG admin gives a reason.
- **2S1-BE-16:** the support form goes to `SUPPORT_EMAIL`, with attachments in the private bucket and a copy to the sender.
- **Screens:** 2S1-FE-08 close/reactivate, 2S1-FE-09, 2S1-FE-10.

### Athletes and guardians (0569cc8; integrated in 0cd8320, 9f0eb78, d4bc22a)

- **2S1-BE-09:** adults are approved automatically. A likely duplicate goes to BTG.
- **2S1-BE-10:**
  - minors: the guardian's page and its documents;
  - proof of guardianship is per child (`AccountDocument.wardId`);
  - `Tenant.staffConfirmMinors` is the staff-confirmation setting, off by default.
- **2S1-BE-11:** the guardian acts for the ward through the `x-sponsorx-ward` header and the ward-switcher cookie. A minor's own login is refused every agreement and money write. An unverified guardian gets 403 `guardian_not_verified`.
- **2S1-BE-12:** an editable age-of-majority table (an unknown place counts as 18 and is flagged). Coming of age gives 90 days, reminders at 90/30/14/7/1 days, a pause on new items and transactions, then termination.
- **Screens:** 2S1-FE-06 (`/join` checklist and `/guardian/setup`), 2S1-FE-07 (New sign-ups, live for all four kinds), 2S1-FE-08 (guardian controls and the coming-of-age reminder).

### Integration

- A single payout hold, `payoutHoldReason`, now covers PROPERTY and ATHLETE payees.
- `RETAINED_DOCUMENT_SOURCES` covers every ID-document table.
- The authz matrix digest changed with the new resources: orderDelivery, teamInvitation, accountClosure, guardianHandoff, signupRules, and `guardianHandoff.approve`.

**Tests:**
- The test suites now use distinct team names per file, because the platform-wide name rule made shared names collide when files run in parallel.
- `alignment.test.ts` now reads the domain directory itself, without the 1 MB `cat` pipe.

**Migrations:** 20261002100000, 110000, 120000, 130000, 140000, 150000.

**Checks:** the backend suite passes 2098 of 2099 (only QA-02 fails), the frontend passes 909, and tsc, eslint and the build are clean.

**Left open:**
- **2S1-BE-16 stays at Code review.** Delivery needs the support mailbox (2S1-OPS-01, `SUPPORT_MAILBOX_READY`) and an email provider key.
- **Not built yet:**
  - a BTG button to confirm a held handoff (the API exists; it only matters with staff confirmation on);
  - a BTG screen for rejected accounts asking to come back (the API exists);
  - a BTG offers desk.
- **Profile edits:** a move to another country isn't re-checked, only a move of state.

**Staging, after `migrate deploy`:**
- re-apply `backend/prisma/sql/*.sql`;
- set `SUPPORT_EMAIL`;
- register MARKETPLACE_ORDER v1 for any tenant that isn't the seed tenant.

## BTG answers an offer change request (backend for the Offers desk, 3c953ff)

**Routes:**
- `POST /offers/:id/change-requests/:requestId/keep {note}` marks the request KEPT. The reply is emailed to the athlete, and to the guardian for a minor (`offer.changeKept`). The offer stays open.
- `POST /offers/:id/revise` withdraws the offer and opens a new DRAFT with every term copied (`fromOfferId`). Open requests become REVISED, and the athlete is told (`offer.revising`).
- `PATCH /offers/:id` edits a draft. It runs the same checks as create, through the shared function `assertDraftTerms`.

**Send:** `sendOffer` now re-checks the terms (a past due date gets 422) and emails the athlete and guardian (`offer.sent`). Before this, nobody was emailed when an offer was sent.

**Change-request fields:** each request now carries `answeredAt`, `answeredBy`, `answer` (KEPT or REVISED), `answerNote` and `revisedOfferId`. Migration 20261002160000.

**Tests:** `phase2-offer-answers.test.ts`, 12 tests.

**Full suite:** 2114 of 2115 on two runs; only QA-02 fails. In one earlier run the coming-of-age test in phase2-guardian-acts failed once and passed alone; watch it.

**Screens:** the Offers desk, Closed accounts and Guardian handoffs prompt for Claude Design is written. The screens get wired when the design comes back.
