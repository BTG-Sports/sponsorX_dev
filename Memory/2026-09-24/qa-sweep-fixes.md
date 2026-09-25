# QA sweep over the day's frontend work — found and fixed (2026-09-24, evening)

Before moving to the next task, everything shipped today was re-verified:
build + 76 tests + lint, two independent code-review passes over the day's
frontend diffs, and a 16-screen × 4-width headless-Chrome sweep (390/470/768/
1280) with screenshot review. Frontend only, per the lead's instruction.
Auth-gated screens were reached through throwaway `/qa` preview routes
(same shells minus `requirePortalAccess`), deleted after measurement.

## Real defects found and fixed

1. **Inventory kind filter was broken** — the "Filter by position kind"
   dropdown called `apply(q, v, kind)` instead of `apply(q, state, v)`, so
   picking a kind set `state="FULL"`: table emptied, chip blank, wrong param
   round-tripped through the URL (`edition-inventory.tsx`). Also added
   `aria-sort` to the sortable columns.
2. **Frost (light) theme broke the login card** — "fixed-dark in both themes"
   was claimed but not enforced: `[data-theme="light"]` re-points `--sx-surface`
   etc. on `<html>`, leaving near-white Clerk ink on white/70 glass. The
   `.sx-login` block now re-pins the dark token literals.
3. **Clerk card burst out of the frame at 390px** — Clerk's runtime-injected
   25rem width outranks appearance classes; fixed with two-class-specificity
   CSS (`.sx-login-card .cl-card { width/max-width: 100% }`).
4. **Unbranded widget headline** — "Continue to My Application" (the unclaimed
   dev instance's app name). The combined flow reads
   `signIn.start.titleCombined`, not `title`; both now say "Sign in to
   SponsorX" via ClerkProvider `localization`.
5. **/join could file duplicate applications** — "Update restrictions" after
   submit re-entered the step flow, whose only forward exit re-POSTs intake
   (no idempotency): duplicate row, clobbered refId/token, burned rate limit.
   Restrictions now edit in place on a dedicated screen; nothing re-submits.
6. **Demo modes reached the real API** — `?demo=minor` walked to the end filed
   a genuine application. `submit()` now simulates success locally under demo.
7. **Failed-submit guidance evaporated** — `goNext`/`goBack` replaced the
   errors map wholesale, wiping API-reported marks on later sections. Now
   merged per-section.
8. **Blank points hero icon** — the points page (server component) imported
   `ICONS` from `portal-nav.tsx` (`"use client"`); server imports from client
   modules arrive as opaque references, so `ICONS.trophy` was `undefined` and
   the `<path>` had no `d`. Path data extracted to `components/icons.ts`
   (no directive), re-exported from portal-nav for client consumers.
   **House rule worth remembering: constants a server component needs must not
   live in a "use client" module.**
9. **Fixture story disagreements** (the one-story invariant): asg-06 is
   PUBLISHED but its +25 pts never accrued and POINT_RULES had no PHOTO reason
   (added both; balance 300 → 325); pt-05 said the concession feature was
   approved Sep 14 while adv-05 said Sep 23 (now Sep 23 everywhere); flatplan
   p17 "Records & standings" vs the reader running the concession feature
   there (p17 retitled "Money & program" — the invariant suite correctly
   blocked moving the article to slotted p16); asg-06's brief claimed pages
   6–7 that don't exist in the reader (claim removed).
10. **Home vs assignments disagreed on "In review"** — home counted APPROVED
    as in-flight (3), assignments bucketed it done (2). Home now uses the same
    buckets.
11. **Editions "Content ready" gate was hand-typed** — "9 of 14 pieces
    approved" matched nothing; now derived from `advisorContentQueue`
    (2 of 6, fails until all clear).
12. **Drawers declared aria-modal but didn't modal** — no initial focus, no
    trap, no restore (assignments + flatplan). New shared
    `use-drawer-focus.ts` hook; verified: focus lands in panel, Tab wraps,
    Escape closes.
13. **Meaning-destroying truncation at 390** — assignment titles and points-
    ledger labels cut to ~15 chars by their badge columns; now `line-clamp-2`
    (note: `line-clamp-2` + `block` cancels the clamp — block wins the display
    war and it wraps unbounded).
14. **Raw enum in UI** — rejected-prospect badge showed `CATEGORY_EXCLUSIVE`;
    humanized.
15. **Reader gallery looked broken** — "twelve frames" headline over six
    unlabeled gray boxes; now 12 numbered placeholder frames plus a "photos
    arrive with the print files" caption.

## Flagged, not code-fixable here

- The Clerk dev instance is still named "My Application" — rename in the
  Clerk dashboard after the lead claims the instance (the localization
  override hides it in our UI meanwhile).

## Verified NOT bugs (screenshot-agent false alarms)

Sidebar nav "missing" at 1280 and the tab bar "covering" content are
full-page-capture artifacts of fixed/sticky elements (live DOM: 7 nav links,
content clears the bar). "Redeem points" and "Submit draft" looking disabled
IS the disabled state, deliberate, each titled with its Stage-9/§14 reason.
Inventory/rights tables "clipped" at 390 scroll inside their own containers
per the house rule.

## Where the tests stand

frontend 76/76 (invariants held throughout — they caught one wrong fix
attempt), lint clean, production build clean, 64-cell sweep zero overflow /
console errors / failed requests. Backend untouched per instruction.
