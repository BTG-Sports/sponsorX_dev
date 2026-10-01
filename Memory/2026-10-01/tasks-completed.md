# 2026-10-01

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
