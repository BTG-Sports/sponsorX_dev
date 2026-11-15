# 2026-11-15 · Polish closed: POL-FE-45 and POL-FE-51 (HeckerCreatives, with Claude)

Branch `fix/POL-FE-51-close-polish`, off `main_development` at `8cea53e4`. It
also carries `chore/POL-44-50-acceptance`, merged in unchanged, because that
branch had not been merged yet and the tracker is a binary file.

**Result:** every Polish item, 1 to 51, is Done (71 rows on the Polish
sheet). `polish.md` says the list is closed: a new flaw is a new item.

## What was walked

The walk ran on the local stack (Docker, API on :4000, `next dev`), desktop
Chrome and Pixel 7, with the QA identities `qa7-admin`, `qa7-campaign_mgr`,
`qa7-sponsor` and `qa7-athlete`. All 7 checks pass.

- **POL-FE-45:** pick a category, press Add, the row appears, and Remove
  clears it.
- **POL-FE-51:**
  - A BTG admin presses Launch now, then "Yes, launch today", and the
    campaign is ACTIVE. The sponsor's page then shows See results.
  - The athlete's profile leads to the rate card, and the rate card leads
    back to the profile.
  - A campaign manager sees no Rate card section.

## What the walk found and fixed

- **POL-FE-45, phone only:** the menu opened downward past the bottom of the
  page. Its last categories sat under the bottom navigation bar at every
  scroll (menu bottom 841px, bar top 759px), so they couldn't be tapped.
  - Fix: `inventory-restrictions.tsx` opens the menu upward
    (`placement="up"`).
- **POL-FE-51, rate card:** the Studio's "Set a rate" link was the only way
  into the rate card.
  - The athlete's profile (`live-signup-profile.tsx`) now has a Rate card
    section. It shows only for an approved athlete, and only to a BTG admin,
    a network manager or SUPER_ADMIN.
  - The editor leads back to the profile with `?from=profile`. When the
    editor was opened from the Studio, the Studio's brief still wins.
  - New helpers `profileRateCardHref` and `rateBackLink` in
    `lib/athlete-rates-live.ts`, with tests.
- **POL-FE-51, early launch:** the start date doesn't move when a campaign
  launches early, so the sponsor saw "Running" and "starts in 10 days" at
  once.
  - Fix: `windowLabel` (`lib/sponsor-live.ts`) reads an ACTIVE campaign as
    "ends in N days". There is a test for it.

## Moved out

The Tester Facility seeding a staffable network (#51) is not done. The
facility is the Railway staging service `tester`, and its source is not in
this repo, so the change belongs to the facility's owner. `polish.md` #51
says which clause of "Done when" is theirs.

## Checks

- Frontend: 174 files, 2064 tests pass.
- `npm run build` passes, and eslint is clean on the changed files.

## Tracker

- POL-FE-45 and POL-FE-51 are Done, dated 2026-11-15. Owner stays infinex1,
  who built them, and the close-out is recorded in Notes.
- Appended the Stage Progress row for 2026-11-15: S9 is 40 (P9-BE-24 and
  P9-FE-12), Done is 320, Days left is 15.5.
  - **Days left includes Dropped tasks' weight**, as every earlier row does
    (`tracker_sync.py` sums every task that isn't Done). Without them the
    figure would be 8.5 and would look like a drop.

## Left in the local DB

- Campaign `qa_pol51_launch` (seed_spn_1), now ACTIVE, created for the
  launch walk.
- The `qa7-athlete` link was restored: User `cmugbsfm10000r4vj2u1mc0v9` has
  `seed_ath_adult` again.
