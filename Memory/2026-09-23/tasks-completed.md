# 2026-09-23 — tasks completed

## `P1-FE-19` — the student portal, and the `P1-FE-18` slice it stood on

*Both Code review. The board said P1-FE-18 was Ready and P1-FE-19 Blocked
behind it; "Ready" was read as "done" at the start of the session and it is
not — no branch holds a fifth `Portal` member. Since P1-FE-19 cannot render
without one, P1-FE-18 was built in the same pass rather than around.*

### What was built

**P1-FE-18** — the NEXT violet as a **token pair** (`--sx-next` /
`--sx-next-soft`), never a literal, because spec v2.0 §14 keeps the fifth
accent an open brand gate. Both `Portal` declarations (`portal-shell.tsx`,
`server/portal.ts`) gained the member, `ACCENT` gained its entry, and the four
spec'd glyphs (book, pen, camera, trophy) joined `ICONS`. Contrast re-run in
both themes before the tokens were committed: dark 5.87 surface / 6.30 bg /
4.78 own-chip; Frost 6.79 white / 5.34 chip. **Frost `next-soft` is
fills-and-gradients only** — 4.48:1 as chip text, under AA — which is the same
rule the other light `-soft` variants already follow. Numbers are in the token
comments.

**P1-FE-19** — `/next`, `/next/assignments`, `/next/sales`, `/next/code`, all
on fixtures, designed at 390px and widened:

- **The portal's primary nav on a phone is a bottom tab bar** — the first
  surface in the app that is not a desk, so navigation sits under the thumb
  rather than behind the hamburger. The bar leaves at `md` and the house
  sidebar takes over. Layout owns the clearance padding.
- **Assignments** is a client island: instant filter chips (no Apply button),
  a brief drawer deep-linkable via `?open=` so the dashboard's "View brief"
  lands on the right row, URL synced with `replaceState`. Drawer motion
  follows the activity-explorer pattern exactly (exit animationend +
  reduced-motion fallback timer).
- **Sales** keeps two lists deliberately apart: the pipeline (the student's,
  alive) and the attribution ledger (SponsorX's record — immutable, value
  frozen at close, kept after graduation). A rejected prospect renders its
  reason code and the **credit-kept** promise, because spec §5.6 makes that a
  requirement, not a courtesy.
- **My code** is built for one scenario: handing a phone across a counter.
  Copy, plus a full-screen presentation mode (huge code, huge QR, nothing
  else). The QR is the reward-creator's decorative stand-in; P9-FE-04 makes
  it real.
- **Points never read as money** (spec §5.5): violet not success-green, "pts"
  spelled out, no `$` in the same tile, and microcopy saying so. The points
  *detail* page is `P1-FE-30` and its nav item ships inert, not hidden.

### Decisions worth recording

**Portal access while `STUDENT` is gated.** `PORTAL_ROLES` gained
`["next", ["STUDENT", "SUPER_ADMIN", "BTG_ADMIN"]]`. `STUDENT` matches nobody
until `P9-BE-05` runs — portal.ts treats roles as routing strings by design,
so the future name is safe to write today. The two admin roles are there so a
fixtures-only surface stays demoable; they still *route* to `/admin` because
that entry is tried first. `P9-FE-01` narrows this when real data arrives.

**Assignment states reuse `DeliverableState`.** It is already the editorial
workflow (the P1-FE-20 observation); the student view just words it
differently ("Advisor review" for `BTG_REVIEW`). A second enum would drift
from the first.

**No student-portal mockups exist.** `Design/frontEndVersion2` covers the
athlete claim/guardian flows — direction, not specification, and nothing for
`/next` at all. Built on the house system in the NEXT accent; re-check when
`P1-ART-08` lands. Noted on the row.

**Fixtures carry the model's invariants, and a test pins them** —
`frontend/tests/student-fixtures.test.ts`: points balance = Σ accruals,
SALES_500 count = ⌊closed/$500⌋, trend ends at the ledger total, rejected
prospects carry a reason and the credit promise. A dashboard whose tiles
disagree teaches the model wrong before Stage 9 ever wires it.

### The board trap, hit again — sixteen rows outside every range

The Dashboard, Stage Progress formulas, the Status validation list and all
three conditional-formatting ranges still ended at **row 237**; Phase 1 data
ends at **253**. Everything raised after the 2026-09-22 extension (P1-FE-27…30,
P9-FE-07…10, P9-BE-15, P3-BE-13/14, the sellPrice row) was silently uncounted
in the live formulas — yesterday's hand-appended snapshot was right only
because it was computed from the sheet, not the formulas. All ranges extended
to 253; conditional formatting rebuilt via a fresh `ConditionalFormattingList`
(the in-place `sqref` mutation corrupts the save — 2026-09-22 log). **This
happens on every append, not only on inserts.**

### Verification

Backend 442 passed, frontend **54** passed (8 new), `npm run build` clean,
`eslint` clean on every touched file. A stale `.next/dev` type snapshot
referencing the deleted `openapi.json` route broke the first build — `rm -rf
frontend/.next/dev` clears it; worth knowing on any machine that ran `next
dev` before the P2-BE-07 route deletion.

Board: `P1-FE-18`, `P1-FE-19` → Code review (HeckerCreatives, 2026-09-23).
Stage Progress snapshot appended: Done 88 · 433 days left (unchanged — Code
review is not Done). Google Sheet still needs its hand mirror at end of day.

## Login redesigned — Stadium Night

*Polish on `P1-FE-17`, no new row. Spec:
`docs/superpowers/specs/2026-09-23-login-stadium-night-design.md`, chosen
through three visual rounds (direction → composition → entrance).*

`/login` is now a full-bleed CSS night stadium — floodlight beams (two blue,
one orange, slow sweeps), a bokeh crowd band, badge and glass card center
stage — with a ~1.2s "lights up" entrance: beams flick on at 0/.3/.6s, crowd
fades, card rises into the beam. The placeholder right panel and its "venue
photography pending" note are gone.

Worth keeping:

- **The page is fixed-dark in both themes** — the media-panel rule
  (`--sx-on-media`) applied to a whole route. A night match has no Frost
  variant.
- **Zero client JS added.** The page stays a server component; the entrance
  is the sx-login-* block in globals.css under the house motion rules (final
  state in the DOM, reduced motion gets the still, phones drop beam 3 and the
  flicker).
- Clerk untouched: hash routing, /portal landing, stripped chrome. The two
  managed-marketplace doors stay under the form.
- Proof line reads from `networkStats` (provenance-sourced). Contrast pass:
  ink at /70 is 8.67 on the crowd band, 5.37 worst-case over a lit dot.

Build clean, eslint clean, 54 frontend tests green, live page probed: all
five scene layers and both entry paths render, HTTP 200.
