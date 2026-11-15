# POL-FE-46: "Check in marketplace now" on a live listing (2026-11-15, infinex1)

Branch `fix/POL-FE-46-check-in-marketplace` (from `origin/main`). Status: Code review. **Not deployed yet.**

- **Asked for:** on the athlete's listing page, the "Live ✓ / Sponsors can find
  it on the marketplace now." banner gave no way to see the listing there.
  Athletes can't open the sponsor Shop.
- **Change:** a **Check in marketplace now** button inside the Live banner,
  linking to the listing's existing sponsor's-eye preview (the same href as
  the page's "Preview as a sponsor sees it" link).
  - `frontend/src/lib/listing-outcome.ts`: new `liveNow()` (published, no
    later publish day); `submitOutcome()` uses it for "Live ✓".
  - `frontend/src/components/athlete-listing-form.tsx`: button to
    `/athlete/listings/<id>/preview`, the form's `secondary` style.
  - `frontend/src/components/property-listing-form.tsx`: the team manager's
    page has the same banner and a preview route, so the button is there
    too, to `/property/listings/<id>/preview`.
  - `frontend/tests/listing-outcome.test.ts`: `liveNow()` test.
- The banner (and so the button) shows right after Submit or Resume, as before.
- **Verification:** eslint clean; `npm test` 167 files / 1991 tests pass;
  `npm run build` passes. Not checked in a browser (staging needs a login; not
  deployed).
- Recorded in `documentation/polish.md` #46 and on the tracker's Polish sheet.
  The POL-FE-44 and POL-FE-45 rows and sections are on their own branches.
