# 2026-11-15 · POL-FE-51 recorded (infinex1, with Claude)

Kept in its own file, like POL-FE-44…50. Docs and tracker only, no code.

- **Found in walkthrough practice:** a tester picking a package at random (Marketplace →
  Packages → Request this → Submit brief to BTG) can end with a request held for BTG, or a
  campaign nobody can be offered, and the sponsor is never told why.
- **What actually gates it (checked in the code):**
  - Automatic approval (`brief-auto-rules.ts`): package on sale, budget ≥ `priceLow`, at
    least `athleteCountMin` athletes fit, no sensitive category, sponsor in good standing.
  - "Fit" (`athleteFit`, `matching.ts`): ACTIVE, the brief's sport and state (exact words),
    no restriction on the brief's or sponsor's categories.
  - Automatic staffing (`auto-staffing.ts`): one offer per package job line per athlete;
    a refusal on any line skips the athlete; budget or running out stops it.
  - **Correction to the report:** a rate for every job is NOT required. No rate → pay is
    the middle of the job's base range (`offer-draft.ts`) and 0 rate points in the match
    score. Rates only rank and floor.
- **Also noted:** brief drawer Sport/Geography come from fixtures even on live
  (`brief-request-drawer.tsx` 56–60); no BTG "launch now" on screen though
  `POST /campaigns/:id/launch` exists, and a blank start date is today + 14
  (`lib/brief-request.ts` line 124), so See results never shows in a test; NEXT ad packages
  share the Packages list, unlabelled.
- **Added later the same day (staging):** the drawer's Start date showed today (11/15/2026)
  filled in, and an untouched brief was held: "the start date (Nov 15, 2026) isn't in the
  future" (`brief-readiness-rules.ts` line 92 needs start > now).
  - Not our code: the field starts empty (native `type="date"`, no `min`, line 263) and an
    empty value becomes today + 14, on `main` too. The browser drew, autofilled or picked
    today.
  - Fix: fill the field with today + 14 or tomorrow, `min` tomorrow, refuse today in the
    drawer. Preferably use the house `DateRangePicker`: the owner rejects native date inputs.
- **Suggested fix:** a plain "can't be staffed yet" message; a staffable marker per package;
  live sport/area lists; the Tester Facility seeds a staffable network (its source is not
  in this repo); a BTG Launch now button (or a staging test start date); a NEXT ad label.
- Logged as polish.md #51 and on the tracker's Polish sheet, row 75 (Order 71), status
  Ready (the sheet's "to do"; its Status list has no "To do"), owner blank.
  Branch `chore/POL-51-campaign-package-prereq`, PR to `main_development`.
