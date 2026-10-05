# Sign-up rules — "Control Panel" redesign (P1-ART-17)

**Date:** 2026-10-05 · **Raised by:** programme owner · **Scope:**
`/admin/new-signups/rules` (2S1-FE-07's rules page). Visual and interaction
only: the reads (`GET /signup-rules/settings`, `/signup-rules/age-table`), the
server actions (`rules/actions.ts`) and the API's BTG-admin-only writes are
unchanged.

Approved direction: **A · Control Panel**
(`.superpowers/brainstorm/rules/rules-direction.html`). Dashboard structure,
not a hero (memory "admin-desks-are-dashboards").

## Header

Mission Control stage, full bleed, fixed-dark, no outlined word. "← New
sign-ups"; title "Sign-up rules" + live dot + Postgres pill; four tiles:

- **Places in the table** — rows, caption "across N countries";
- **Unknown place** — `unknownPlaceAthletes`, orange when > 0, caption
  "athletes counted as adults at 18 · flagged on New sign-ups";
- **Not 18** — places whose age isn't 18;
- **Minors** — text tile: "Approved by their checks" (green) / "Wait for a
  person" (orange).

## Controls

- **Minors** panel: a designed `role="switch"` replacing the checkbox; an
  Off / On pair explaining both behaviours (current one lit); the result
  message inline.
- **Add or change a place** panel: country and state fields (mono caps), an
  age stepper (− n +, 14–25), "Save place"; the hint stays.

## The grid

Age chips (All · each age present, with counts) and an instant search
(client-side — a bounded catalogue of ~60–70 places, allowed by the
pagination rule). Sections (`placeSections`): each country with states or
provinces its own (biggest first; whole-country row first, then regions A→Z),
and every whole-country-only place in one "Countries" section — twenty single
tiles otherwise took a row of the page each (seen in the first walk). Each
tile: code (or "All of US") and the age, banded: under 18 violet, 18 blue, 19
cyan, 20+ orange. Hover / focus → "×"; click → inline "Remove AL? Yes / No".
Staggered rise-in. Refusals show the API's words.

**Picking a tile** loads it into the form and scrolls there — and, the owner
asked twice, never as a silent jump: the panel glows from behind (a wrapper,
since the chamfer clip cuts the panel's own shadow) and pulses a bright ring
twice; a lit callout bar reads "Editing AL, US — adult at 19" with two
numbered steps ("Set the new age with − / +", "Press Change AL, US") and a
"Cancel · new place"; the age stepper carries a bright ring; the picked tile
stays lit (`aria-pressed`); a polite live region says the same. All of it
stays while the picked place is in the form.

## Build

- `lib/age-table.ts` (pure): `ageBand`, `placeLabel`, `ageChips`,
  `groupPlaces`, `placeSections` — unit-tested.
- `components/rules-board.tsx` (client): the form, chips, search and grid
  in one island (a tile fills the form). `components/signup-rules-editor.tsx`
  keeps `StaffConfirmSwitch` (restyled), the old form and remove button go.
- `rules/page.tsx` on the stage; `rules/loading.tsx` dark.

## Verification

Unit tests; frontend tests and lint; build in a detached worktree (then the
rimraf check); browser walk as BTG_ADMIN — tile → form, save an unchanged
place, a chip and the search, dark / light / 390. No real place is removed
in the walk.
