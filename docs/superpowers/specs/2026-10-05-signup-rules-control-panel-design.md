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

## The age table — built for scale

The owner asked mid-build: "what if there are more countries and more state
/ provinces". The first cut laid every place out as a tile (3,786px tall
with 85 places; it would grow without bound). The table now never renders
whole:

- **Global search** across every country, by code or name (country names
  from `Intl.DisplayNames`; state / province names from `lib/region-names.ts`
  for US, CA, MX, AU, BR, IN — other codes stay searchable by code). A
  listbox (↑ ↓ ⏎ Esc); picking selects the country and loads the place.
- **Country rail**: every country once (most places first), its default age,
  place count and exceptions badge; its own filter and an All / Not 18
  switch; it scrolls inside its panel.
- **Country panel**: the default (the whole-country row, clickable), then
  every place as a **large card** — code badge, full name, the age, a status
  line ("Exception · US default is 18" / "Follows the US default"), a history
  line ("Default table · Sep 30, 2026" / "BTG staff · Oct 5, 2026") —
  exceptions first, **20 per page** with the house pager above (with
  "Showing x–y of n") and below, and All / Exceptions / Follow the default
  tabs. (Owner, after the first scale cut's small chips and "Show all 48":
  "list the items 20 items per page, make the items large, add more detail on
  each items".) The bottom pager returns to the top of the list. A country
  with no whole-country row lists every place, with no tabs. 20 countries or
  200, the page height stays bounded.
- **Remove** moves into the edit panel ("Remove AL, US" → confirm) — one
  place for it whether the place was a tile or a chip.
- The form is empty at rest ("Add a place"); the save button has its own
  full-width row.

**Picking anything** loads it into the form and scrolls there — never a
silent jump (the owner asked twice): the panel glows from behind (a wrapper,
since the chamfer clip cuts the panel's own shadow) and pulses a bright ring
twice; a lit callout bar reads "Editing Alabama, United States — adult at 19"
with two numbered steps and "Cancel · new place"; the age stepper carries a
bright ring; the picked tile or chip stays lit (`aria-pressed`); a polite
live region says the same.

## Build

- `lib/age-table.ts` (pure): `placeLabel`, `ageBand`, `countryName`,
  `regionName`, `placeName`, `countryIndex`, `countryDetail`, `searchPlaces`,
  `PLACES_PER_PAGE`, `placeList`, `placePage`, `statusWords`, `changedWords` —
  unit-tested; `lib/region-names.ts` (data).
- `components/rules-board.tsx` (client): the form, the search, the rail and
  the country panel in one island (anything picked fills the form). `components/signup-rules-editor.tsx`
  keeps `StaffConfirmSwitch` (restyled), the old form and remove button go.
- `rules/page.tsx` on the stage; `rules/loading.tsx` dark.

## Verification

Unit tests; frontend tests and lint; build in a detached worktree (then the
rimraf check); browser walk as BTG_ADMIN — search → pick, rail filter and
switch, chip → form, save an unchanged place, Remove armed then kept, dark /
light / 390. No real place is removed in the walk.
