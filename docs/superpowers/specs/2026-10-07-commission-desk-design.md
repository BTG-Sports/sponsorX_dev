# The commission desk (P1-ART-19)

**Date:** 2026-10-07 · **Raised by:** programme owner ("/admin/commission
page visual design looks shit, too much space, redesign or restructure the
page itself to make it easier for the eyes of the user") · **Scope:**
`/admin/commission` (2S5-FE-01) — structure and visuals; no change to what
the API decides (which rule applies, versions, the split).

## What was wrong

Six tall cards, one per rule kind, stacked down the page — most saying "No
rule — this adds nothing to a sale". Under them a whole add-rule form,
always open. Under that the sample order, with its line laid out across the
width and a "Remove" button floating at the far right. A screen and a half
of boxes to learn one thing: what comes off a sale. On a phone, four
screens.

## The desk

Three things, one screen, in the Mission Control language the rest of the
admin portal now wears (P1-ART-14…18):

1. **The split strip.** Six tiles in one row (3 across on a tablet, 2 on a
   phone) in the order money comes off a sale (ledger design §2): platform
   fee → management fee → processing → referral → reserve → the property's
   cut of athlete items. Each tile headlines the rate **for everyone**
   ("15% + $0.30", or "—") with one line under it: "everyone · 2
   overrides", "everyone · since Sep 12, 2026", "2 scoped rules · none for
   everyone", or "no rule · adds nothing". The strip *is* the answer to
   "how is a sale split?". A tile picks a kind (`aria-pressed`); the first
   kind with a rule is picked on arrival.
2. **The kind's rules — one table.** The stage table from P1-FE-31: applies
   to (with the note under it, and "applies first" on the top row), rate,
   priority, since, version — highest priority first, the order the API
   tries them. A row's earlier versions unfold under it from a "2 earlier"
   link. An empty kind is one dashed line with "Add one". "+ Add a rule"
   sits in the panel's header.
3. **The sample order — beside it, sticky.** On a wide screen the sample
   order sits to the right of the table and stays in view. Each line is a
   compact card: item and price on one row; "Sold by" (a named dropdown)
   and the athlete's-item toggle on the next; the property's cut only when
   it's an athlete's item. "Work out the split" draws the waterfall — the
   fees marked "−", the two "what the property gets" rows highlighted.

**Add and revise are a dialog**, in the sign-up rules dialog's shape
(P1-ART-17: chamfered night glass, named dropdowns via the exported
`ComboBox`, nothing typed that isn't a choice). Add presets the kind from
the tile; revise fixes the kind and scope and names them in the title.
"Preview with this rule" works the desk's sample order out with and without
the unsaved rule, side by side, inside the dialog, before anything is
saved. Saving closes the dialog and leaves one green line on the desk
saying what changed.

## Not changed

The API contract and the server actions; `commission-live.ts`'s existing
functions (one added: `kindSummary`, the tile's words, unit-tested); the
BTG-admin-only rule.

## Verified

tsc, eslint, unit tests (the three new `kindSummary` cases); a Playwright
pass as BTG_ADMIN at 1440 and 390 — the strip, the split, the dialog with
its preview and dropdown, Escape closing, no console error, no overflow.
