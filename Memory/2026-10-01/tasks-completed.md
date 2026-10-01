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
