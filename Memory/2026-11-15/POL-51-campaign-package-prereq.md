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

## Built the same day (infinex1, with Claude)

- **Sponsor side, PR #420** (`feat/POL-FE-51-sponsor-side`):
  - start date opens at today + 14, never today;
  - live Sport/Geography (`GET /catalogue/targeting`);
  - `waitingOn` and "Waiting for athletes" on the sponsor's requests;
  - "Approved — finding athletes" in place of "Ready for you";
  - "Ready to staff" / "Not enough athletes yet" on packages;
  - "Magazine ad (NEXT)" label.
- **BTG side, PR #421** (`feat/POL-51-btg-side`):
  - a rate card editor at `/admin/athletes/[id]/rates`, with the new read `GET /athletes/:id/rate-editor` (`POL-BE-51`);
  - the Matching Studio's no-rate row reads "Needs a rate" with a Set a rate link;
  - Launch now on a campaign in APPROVAL.
- **Correction:** the Studio *does* require a rate for BTG's manual path. A held brief was unstaffable by hand, because no screen wrote rates.
- **Still open:**
  - the Tester Facility seeding a staffable network;
  - an admin athlete list that links to the rate editor.
- Tracker Polish row 75 is at **Code review**.
- Also today: `P9-BE-24` / `P9-FE-12` (rcfworks, PR #417) built the advisor's Content review and the student's Assignments. The "not connected yet" seen in practice was the pre-merge staging build.
