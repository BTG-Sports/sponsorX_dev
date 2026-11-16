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

## Profile wizard (POL-FE-80, `feat/athlete-confirmations-wizard`, HeckerCreatives)
- **Why:** the programme owner found `/athlete/profile` (nine section plates under a KPI row) confusing and asked for a step-by-step wizard with animation in the Arena's theme. Once the profile is complete: no wizard, no "Open public page", the public page itself.
- **Built:**
  - `lib/profile-wizard.ts`: the seven steps (the §24 meter's answerable sections; the rate card and payment are BTG's, so never a step), `wizardDone` / `profileComplete` / `nextOpen` / `minutesLeft`, what a step still needs (`stepNeeds`, one plain sentence), `stepChanged`, `changeBody` (the full editor's own bodies, never a legal name, date of birth or guardian), and `publicFace` (only what `GET /public/athletes/:slug` sends).
  - `components/profile-wizard.tsx` (client island): an intro with a progress ring, a track of numbered stops across the top, the step (who sees it: eye or lock; big fields, segmented level, a card per platform, tap-to-pick chips with a count, "Nothing's off-limits" as an answer), a footer with "Step N of 7", Previous, Skip for now and Save & continue, and a live preview of the public page that lights the part being filled (veiled on a private step). A save plays a medal and moves to the next open step; the last opens the finale, then the page. The agreement step opens Confirmations with `?return=/athlete/profile`.
  - `components/profile-showcase.tsx` (server): the public page's sections in its order, in a browser frame with the address and Live / Not live yet; a letter-by-letter name and count-ups; Invitations where "Request a proposal" would be (memory: portal-views-stay-in-portal); the private sections under it.
  - The island stays mounted across `router.refresh()`, so finishing celebrates before the now-complete page shows the showcase (passed in as a node). A profile finished elsewhere gets a one-time ribbon (localStorage flag set while the wizard was seen).
  - `components/wizard-kit.tsx`: the medal, confetti and glyphs, moved out of `confirmations-wizard.tsx` (now imports them). The page imports `confirmations.css` plus its own `profile.css`.
  - Header: unfinished → "Open public page" (if ACTIVE) only — the owner dropped "Full editor" (POL-FE-81); finished → "Edit profile" only. The h1 is still "Public profile" (e2e loop-p3 reads it).
- **Checked:** `profile-wizard.test.ts` (new, 12): helpers plus the page rendered against a stubbed API, unfinished (wizard opens on the first open step) and finished (public frame, no Open public page, no legal name or rates inside the frame). Full frontend suite 189 files / 2,181 tests. tsc and eslint clean. Walked live on :3000 as the QA athlete at 1440, 1024, 390 and 320: sport → content → brands → off-limits → Confirmations → back to the public page with the ribbon. No console errors, no sideways scroll, one `AthleteProfileChange` per save under a double click. `next build` not run: the owner's `next dev` was live.
- **Local data:** the walk's edits to `seed_ath_adult` (position, level, content, brands, restrictions), its four `AthleteProfileChange` rows and its agreement acceptance were removed again afterwards, as they were before.

## Home → profile wizard (POL-FE-81 follow-up, HeckerCreatives)
- The owner asked that the home's "Finish profile" open `/athlete/profile`, which is the step-by-step wizard while the profile is unfinished (POL-FE-80), not `/athlete/profile/edit`. They also asked that the full editor be off there while the wizard is on.
- `profileStep` now links to `/athlete/profile`. The profile header drops the "Full editor" pill while unfinished.
- Kept on purpose: the identity step's inline links to `/athlete/profile/edit?section=identity`, for changing the legal name and naming a guardian. The wizard can't do either, and a minor with no guardian named would otherwise have no way to name one.
- `profile-wizard.test.ts` now asserts no "Full editor" and no bare `/athlete/profile/edit` link while unfinished. Agreed with the POL-FE-80 session.

## Game plan tucks away once done (POL-FE-81 follow-up, HeckerCreatives)
- **Owner:** the first time everything is done, hide the plan on a timer. After that the dashboard shouldn't show it.
- **The first time all steps are squared away (no guardian step pending):** the finish line celebrates.
  - Confetti plays every time, then an 8 s countdown runs (`PLAN_HIDE_AFTER_MS`). The countdown pauses while the card is hovered or focused.
  - "Hide now" hides it at once. "Back to the steps" cancels the auto-hide, since they chose to look.
  - The plan then shrinks away (grid rows 1fr→0fr) and unmounts, gap included.
- **Later visits:** the cookie `sx_gp_cleared=<athlete id>` (path `/athlete`, 1 year, not httpOnly, UI only) tells the server page to leave the plan out, so nothing flashes in. `planHidden` / `planCleared` / `planKey` are in `lib/athlete-game-plan.ts`.
- **When a step needs the athlete again:** the plan renders and the client clears the cookie. The next time they finish it celebrates again.
- **The cookie is per browser:** a new device celebrates once more.
- **Checked:**
  - Tests: 20 (cleared/hidden/key helpers, and the page with and without the cookie).
  - Walked in Chrome on a throwaway route with every step done (deleted after): cookie set, hover paused 7 s, folded after the remaining time with the gap closed, "Hide now" folded at once, "Back to the steps" kept it. No console errors.

## Public athlete page redesign (POL-FE-82, `feat/athlete-confirmations-wizard`, HeckerCreatives)
- **Why:** the programme owner asked for a big visual redesign of `/athletes/[slug]`, with animation and wow factor. Three profile references: a cover, an overlapping photo, big stats, sticker badges, tabs and work cards. It had to be easy to understand, keep the theme, and show what the athlete did on the platform. After seeing it they added: show it on `/athlete/profile` once the wizard is complete.
- **API:** `GET /public/athletes/:slug` adds three fields; all are null for a featured athlete.
  - `photoUrl` follows the home page's minor rule: a minor's photo, or one with no age on file, shows only after BTG approves it.
  - `memberSince`: the approval month.
  - `track` (`publicTrackRecord` in `domain/featured.ts`): counts only. Campaigns completed, distinct brands, live and verified posts, on time, fan redemptions, and the last six posts (platform and month only). No sponsor or campaign name, money or title.
  - The photo's CDN address carries the storage path. The home panel already publishes the same address.
- **Page:** `components/athlete-public-page/` (moved out of the route) has a `public` mode and an `owner` mode. Words and badges are in `lib/public-athlete.ts`; the `PublicAthlete` type moved there too, and `featured-profile.tsx` re-exports it.
  - The page reads as three tabs: Track record, Reach, About.
  - One action: "Request a proposal" in the hero, plus a three-step card.
  - The motion island `profile-fx.tsx` does reveals, tilt and glare, cover parallax and the scroll-following tabs.
  - The hero waits for the boot screen. Reduced motion gets a still page; no-JS shows everything.
- **Owner view:** once the wizard is complete, `/athlete/profile` reads the same public answer (`apiFetch`). If that read fails, the page errors; it never falls back to a stand-in. A profile that's complete but not live shows the public sections with no record and "Not live yet".
  - Owner mode drops "Request a proposal" and "Is this you?" for "How sponsors reach you" → Invitations, plus a "Make your page stand out" card.
  - The name is an h2 under the "Public profile" h1, which e2e loop-p3 reads.
  - The showcase still passes a node into the wizard island. The private sections stay under it.
- **Checked:**
  - Backend: `public-track-record.test.ts` (new, 5) and the `next-rights` key set, 38 together. Run against the Docker DB with the root `.env` loaded.
  - Frontend: `public-athlete.test.ts` (new, 14) and `profile-wizard.test.ts` (stubbed public read, plus an error on a failed read). The full suite is 190 files and 2,200 tests; tsc and eslint are clean.
  - Walked live in Chrome at 1440 and 390, on the public page (Elijah, Jordan) and the finished `/athlete/profile` as the QA athlete. No console errors, no sideways scroll, every reveal ended visible.
  - `next build` was not run: the owner's `next dev` was live.
- **Local data:** the walk filled `seed_ath_adult`'s profile and added one agreement acceptance (`pol82_walk_acc`). Both were restored to the snapshot afterwards and checked. The dev API (:4000, `src/index.ts`) was restarted to pick up the new fields.
- **Noticed:** `seed_ath_adult`'s local photo is a picture of a sample driver's licence. That's dev data, but it is now on its public page. Swap it before any screenshot leaves the team.

## Release: the athlete wizards and the public athlete page (HeckerCreatives)
- `feat/athlete-confirmations-wizard` → `main_development` by #434 (POL-FE-79) and #435 (POL-FE-80, -81, -82; ef591e9c). All four checks were green on each PR.
- `main_development` → `main` by #436. Besides the screens, it carries one API change from POL-FE-82: `GET /public/athletes/:slug` now also returns `photoUrl` (the home page's photo rule for minors), `memberSince`, and a counts-only `track` record. No migrations, no switches.
- Tracker: POL-FE-79, -80, -81 and -82 moved to Done (Polish sheet), with each one's PR in the note.
- Three Claude sessions worked in one checkout today (POL-FE-80, -81, -82). They split the shared records over cross-session messages and committed by pathspec; one session owned each PR and merge.

## Athlete inventory redesign (POL-FE-83, `feat/POL-FE-83-athlete-inventory-redesign`, HeckerCreatives)
- **Why:** the programme owner asked for a big visual redesign of `/athlete/inventory` with animation and wow, easy to understand, keeping the Arena theme. The references were an inventory table, a product list under a statistics row, and an app store with Activate buttons. While it was built they added:
  - adding is "a button then a popup";
  - the list comes first, with an Add button;
  - the two blocks at the bottom (how selling works, won't-promote categories) had to go;
  - an item opens as a public-style "View" that sells it to sponsors, with Edit behind a button.
- **List page:**
  - The title row carries **Won't promote · n** (the restrictions, as chips in a popup) and **+ Add an item** (kind tiles and the same form, in a popup).
  - In the add popup, **Add item** creates the item Available and **Save as draft** creates it Paused. `POST /inventory` already took `active`; walked live, the draft landed Paused and "Not on the marketplace yet". The buttons are pinned to the popup's bottom edge.
  - Tabs carry the API's whole-scope counts: All, Available, Paused, Not listed yet (`?unlisted=true`).
  - Search, then List (the default) or Cards. Each item has an optimistic **Available / Paused** switch and a marketplace badge from its listing (`GET /listings`): "On the marketplace", "Draft listing", "Not listed", and so on.
  - The first build called the switch "On sale", and the owner caught an "On sale" item under "Not listed yet". The switch only lets an item be sold. The shop shows a listing only while it's published, public and its item is on (`marketplace-search.ts`).
  - An empty inventory gets a hero with "Add your first item" and idea tiles.
  - Words per item are in `lib/inventory-shop.ts`. Styles are in `athlete/inventory/inventory.css`.
- **Item page (`/athlete/inventory/[id]`):** a showcase in the public profile's style (`components/athlete-inventory/item-showcase.tsx`, `lib/inventory-showcase.ts`, `[id]/item.css`).
  - It shows a kind-coloured stage that tilts, the title, the price, stock and dates, package rules and contents, and good-fit brands.
  - "Who you're working with" shows reach and track record from `GET /public/athletes/:slug` once the athlete is live.
  - The marketplace line comes from `GET /listings`: live, under review, or not listed, with "Open the listing" or "List it", or "your team lists it".
  - One panel is marked "Only you see this".
  - The owner bar holds the Available switch and **Edit item**, which opens the old edit form in a popup. Cards say **View**.
  - The marketplace line says when a live listing is hidden because the item is paused.
  - The property portal's inventory is unchanged.
- **Shared code touched:**
  - `InventoryForm` takes an optional `kind` / `onKindChange` (create mode, for the tiles).
  - `InventoryRestrictions` is redrawn as chips, and its menu now opens downward inside the popup (POL-FE-45's "up" was about the page's bottom bar).
  - `e2e/marketplace-path.spec.ts` clicks "Add your first item" / "Add an item" before the form.
- **Checked:**
  - New tests: `inventory-shop.test.ts` (13) and `inventory-showcase.test.ts` (8). The frontend suite is 2,216 tests; tsc and eslint are clean.
  - Walked live in Chrome at 1440 and 390 as the QA athlete: list, cards, tabs, both popups, the empty hero (a throwaway route, deleted) and two item pages. No console errors, no sideways scroll.
  - `next build` was not run: the owner's `next dev` was live.
- **Local data:** the draft walk created "POL-83 draft walk" (Paused) on `seed_ath_adult`. There's no delete route, so it stays.
- **Tracker:** a POL-FE-83 row was added to the Polish sheet as Done, and the autofilter, validation and conditional-formatting ranges were extended to row 123. Today's Stage Progress snapshot was appended; Phase 1 is unchanged from 11-15 (320 done, 15.5 days left, Dropped included).
