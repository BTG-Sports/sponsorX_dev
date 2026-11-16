# 2026-11-16 — rcfworks

## CI fix on #427
- `student-assignments.test.ts`'s audit test failed on #427's CI: two steps written in the same millisecond came back in the wrong order. It now orders by time, then by id. The fix was merged up through #428, #429 and today's branch.

## App review wave 5–6 (PR A, `fix/POL-71-75-app-review-waves-5-6`, stacked on #429)
- **POL-71:**
  - The empty sponsor dashboard shows "Needs you" (a Shop order to pay, requests with BTG).
  - `/brief` says what really happens.
  - Viewers can't request.
  - The role reads "Sponsor Viewer" everywhere.
  - `POST /sponsor/team/:id/restore` adds back a removed teammate. A login BTG switched off stays off.
- **POL-72:**
  - While payments are closed, approved orders read "Approved" (`paymentsOpen` on the orders summary and the sponsor overview).
  - The spending limit shows at checkout (`checkout.spendingLimitCents`).
  - Shop listings get "More", and "Order again" goes to the Shop.
  - Job names come from the live catalogue, with a "Ready to staff" filter.
  - Intelligence has one name.
  - Billing points Shop-only sponsors to Orders.
  - Staff see "Not in your role" on Packages.
  - BTG can edit a sponsor's categories.
- **POL-73:**
  - Payout emails link to `/payouts/<id>`, which opens each reader's own workspace.
  - Approved payouts get a `waiting` reason, and the API reports the active provider.
  - The Treasury tile opens the tab that has something in it (`needsYou.payouts.requested`).
  - Payouts has a "Sent back" tab.
  - VOIDED reads "Voided — nothing owed".
  - The refund wording is fixed.
  - Finance sees committed revenue on editions as a total only (no slot read).
- **POL-74:**
  - Integration health marks parked Zoho jobs, and the board says "Zoho not connected".
  - Pricing and Forecasts say they update nightly at 19:00 UTC.
  - Attribution gets a Partners panel.
  - New doc: `documentation/SponsorX-Testing-on-Staging.md`.
- **POL-75:**
  - The team manager's dashboard gets buttons, and Settings drops the sample links.
  - The item form gets Package rules. Bundle-only isn't enforced anywhere, so it isn't offered.
  - Each deal holding a closure links to where it's settled (`campaignId` and `orderId` on live deals).
  - Settings gets a Notifications section in every portal.
- **Leftovers:**
  - POL-68: confirmation links on offers and inventory.
  - POL-69: athletes can open their versions, one name per page, and Confirmations is in the menu.
- **Local CI:**
  - Lint, security scripts and secret scan all pass.
  - Both builds pass.
  - Backend: 265 files, 3,832 tests. Frontend: 186 files, 2,146 tests.
  - E2E wasn't run locally: it needs Redis and Clerk test keys. CI runs it.

## App review waves 7–8 (PR B, `fix/POL-76-78-app-review-waves-7-8`, stacked on PR A)
- **POL-76:**
  - Applicants are emailed when the application is received, approved (with sign-in steps), sent back for changes and declined. The new templates are `student.received`, `student.approved`, `student.changesRequested` and `student.declined`, sent by `tellApplicantIn` inside `moveStudentIn`.
  - Reviewers' student rows carry `login` (signed-in, invited, no-email or address-in-use).
  - After a decision, the desk says who was emailed and whether they can sign in.
- **POL-77:**
  - My code shows a real QR. `qrcode` was added to the frontend, and the QR is drawn as SVG on the server.
  - The public edition returns approved text (`contents[].text`). "Read" opens it and records a LINK_CLICK on the article.
  - Published editions get "View the public edition →", and the `/next/schools` list links to each edition. The editions list now carries `publication.property.slug`.
  - Students and advisors get a "This edition" card.
  - The advisor desk gets a roster paste box.
  - Sponsor cards stay plain because no sponsor web address is stored.
- **POL-BE-69:**
  - Profile completion counts agreements by athlete: the athlete's own logins, rows naming the athlete, and what their guardian authorised.
  - The Agreements section links to Confirmations.
- **POL-78:** five stale claims in `polish.md` corrected in place.
- **Local CI:**
  - Lint, security scripts, secret scan and audit all pass.
  - Both builds pass.
  - Backend: 266 files, 3,839 tests. Frontend: 187 files, 2,146 + 8 = 2,154 tests.
  - E2E wasn't run locally (it needs Redis and Clerk test keys).

## Next
- Merge order: #427, then #428, #429, #430, and PR B.
- Then `main_development` → `main` by PR, deploy staging, and run yesterday's two staging checks.

## Confirmations wizard (POL-FE-79, `feat/athlete-confirmations-wizard`, HeckerCreatives)
- **Why:** the programme owner found `/athlete/confirmations` (two stacked cards) "so confusing for a human" and asked for a step-by-step wizard with animation. Then gave a reference: numbered circles joined by a line, "Step 1", title, paragraph, content, footer with "Step 1 of 3" and Previous / Next.
- **Built:**
  - `components/confirmations-wizard.tsx` (client island) replaces `components/confirmations-form.tsx`. The page stays the server read and decides every word; no function props cross.
  - Stepper: a vertical rail at `lg`, dots across on a phone; the line fills green when a step is done. Steps: read it, tick the box (a selectable card), confirm. Footer: "Step N of M", Previous, the one action; on a phone they stack full width.
  - The agreement reads section by section with a reading bar and chips (`agreementSections` / `sectionChip` / `readMinutes` / `nextStep` / `stepState` in `lib/athlete-confirmations.ts`).
  - A confirm plays a medal + confetti and moves to the next open step; "All set" lists both records and the way back (`?return=`).
  - Every panel is rendered and the inactive ones `hidden`, so the wording is in the markup without JS and each entrance replays.
  - Styles in `app/(app)/athlete/confirmations/confirmations.css` (page-only, theme tokens, reduced-motion still look).
  - Kept: the double-submit ref, `autoComplete="off"`, the seats (minor's own login, guardian acting, unavailable).
- **Checked:** `athlete-confirmations.test.ts` 20/20 (page tests moved to the wizard's words; new helper tests, incl. word-for-word against `backend/agreements/COLLAB.v2.txt`); tsc and eslint clean. Walked live on :3000 as the QA athlete at 1440 and 320: rules → confirm → agreement → accept → All set, no console errors, no sideways scroll. `next build` not run: the owner's `next dev` was live (memory: never-build-into-live-next-dev).
- **Local data:** the walk cleared and re-made the QA athlete's (`seed_ath_adult`) rules confirmation, now dated 2026-11-16; its agreement acceptance was removed again afterwards, as it was before.
- **Seen once:** the first confirm after swapping the form file hit "This page couldn't load" on refresh. It didn't come back in three later runs, so it looks like a dev recompile race on the action ids. Watch for it on staging.

## Athlete home game plan (POL-FE-81, `feat/athlete-confirmations-wizard`, HeckerCreatives)
- **Why:** the programme owner asked for a big visual redesign of `/athlete` as a step-by-step wizard, "easy to understand", with animation, keeping the Arena theme; three dashboard references (KPI cards with ring gauges, bar charts). The old home was eleven blocks and no first move.
- **Built:**
  - The top of the home is the **game plan** (`components/athlete-game-plan.tsx`, words/states in `lib/athlete-game-plan.ts`): the six steps from sign-up to paid: profile, agreements, payouts, answer, deliver, get paid. A step the login doesn't have is left out (a guardian has no payee; staff preview has no profile).
  - Left: a score ring ("2 of 6 squared away"), a headline ("4 things need you"), the stepper (a rail at `lg`, dots on a phone). Right: one step: "Step N of 6", a state tag, title, one sentence, the body, and a footer with Previous, Next / Skip for now and the one thing to do.
  - It opens on a **late** step first (overdue deliverables), else the first that needs the athlete, else the finish line ("You're all caught up", medal; confetti once per browser session via sessionStorage).
  - Arrow keys walk the stepper; a sideways swipe moves a step on a phone.
  - What moved into the steps: the "coming up" plates (offers, invitations, deliverables, marketplace sales), the profile lane, the payout banner with the Stripe button, the orders-waiting plate and the confirmations banner (`ConfirmationsBanner` is no longer used on the home).
  - Below: "At a glance": KPI plates with ring gauges (`components/athlete-glance.tsx`, `components/arena-ring.tsx`). Rings only where a real share exists: deliverables on time, earnings paid. Then the earnings as four bars (one hue, the paid bar lit, values and a hover/focus tooltip, sr-only table), payouts, the shop, the Certified Recruiting card.
  - Styles: `app/(app)/athlete/home.css` (page-only, theme tokens, Frost + dark, reduced-motion still look).
  - Same reads as before; nothing new is fetched or estimated.
- **Checked:**
  - `athlete-game-plan.test.ts` (new, 8) and `athlete-home-phase2.test.ts` (8, one new for where the wizard opens) pass. tsc and eslint are clean on the changed files.
  - Walked live on :3000 as the QA athlete at 1440, 1280 (Frost) and 390: no console errors from the home, no sideways scroll.
- **Parallel session:** another session took POL-FE-80 (the `/athlete/profile` wizard, `wizard-kit.tsx`) in the same checkout. We agreed the IDs over cross-session messages, and each commits by pathspec.
