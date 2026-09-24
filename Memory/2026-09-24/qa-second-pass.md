# QA second pass — the sweep swept again (2026-09-24, night)

The lead asked for a full recheck of the first sweep. Independent lanes: an
audit of the fix commit itself, a fresh-lens review pointed where pass 1 did
not look (state machines, URL contracts, server/client boundaries, validation
edge cases), the browser sweep re-run in BOTH themes (15 screens × 4 widths ×
2 themes — all 120 cells clean), 18 scripted functional walks, and light-theme
screenshot review.

## The pass-1 fix commit had bugs of its own

1. **The committed tree failed `npm run build`** — pass 1's `reasonCode`
   humanize called `.replace()` on `string | undefined`. Worse, pass 1
   reported "build clean" because `npm run build | tail` reports **tail's**
   exit code — the pipe masked the failure. Fixed (`p.reasonCode && …`), and
   the build now runs unpiped with its exit code checked directly.
2. Everything else in the commit audited clean: icon paths byte-identical
   after the icons.ts move, focus hook cannot strand focus, demo guard holds,
   all fixture arithmetic reverified independently.

## New defects found and fixed (fresh lens)

3. **/join: "start over"/"finish later" kept a failed submit's red field marks
   and danger banner** — a pristine section 1 rendered pre-decorated with
   errors. Both now clear them.
4. **Flatplan drawer read `?open=` but never wrote it back** — close the
   deep-linked drawer, press F5, it reopens; the URL also kept claiming the
   old page after opening another. Now synced both ways (the
   student-assignments contract).
5. **`?open=` (empty string) opened the back-cover drawer** — `Number("")` is
   0, and 0 is the back-cover sentinel. Guarded.
6. **Inventory trusted raw URL filter values** — `?state=BOGUS` emptied the
   table while the dropdown said "All states" and the chip rendered blank.
   Unknown values now mean no filter.
7. **Assignments drawer: the 400ms fallback timer captured a stale closure**
   and could write the pre-close filter into the URL. Filter read via ref.
8. **Fullscreen QR overlay wasn't modal in behavior** — no focus move, no
   scroll lock, Tab wandered the hidden page. Now: dialog semantics, focus
   onto the overlay, Tab pinned (single-control dialog), body scroll locked,
   focus restored.
9. **A `socials.N.handle` API error always landed on the Instagram input**,
   even for a bad TikTok handle — now routed by the platform actually sent at
   that index.
10. **DOB accepted `2040-01-01`** (files as a minor, summons the guardian
    branch) and `1902` — both sides let any ISO date through. The identity
    step now bounds it (past, ≥1920); test added (frontend now 77).
11. **Reader: a SOLD back cover rendered nothing** — the buyer of the
    most-seen page vanished from the reader. SOLD now renders the SponsorCard
    (RESERVED stays private).
12. **Hydration risk on four older client components** (applications-desk,
    campaign-builder, charts, roster-ops): `toLocaleString()` with no locale
    SSRs as en-US but hydrates in the visitor's locale (fr-FR renders
    "12 400"). All eight sites pinned to `"en-US"` (the `money()` precedent).
    Server-component call sites were left alone — they render once.
13. **Frost contrast micro-fixes** from screenshot review: flatplan legend's
    Open/Editorial swatches and inventory's OPEN dot used line-tones that
    vanish on white (now muted-tones); reader gallery frame numbers
    text-faint → text-muted. Light theme otherwise shipped clean —
    the login's night scene held perfectly under Frost.

## Deliberate non-changes (flagged, not fixed)

- The wizard requires ≥1 social handle locally though the API accepts none,
  and `level` must be answered but unmappable values ("varsity") are omitted
  rather than guessed (§22) — both product calls, not defects.
- `country` is asked but not transmitted (US-only Phase 1 contract has no
  field) — now documented in join-flow's withheld-sections comment.
- `/next/code` has no `?demo=empty` branch — defensible: the code exists from
  day one.
- Latent, recorded: reader metadata hardcodes the one fixture edition
  (P9-FE-07 wires EditionState).

## Process lessons (also in private memory)

- **Never `npm run build` or delete `.next` while `next dev` serves the same
  dir** — the running server corrupts into all-routes-500 (plain-text body,
  no overlay) and masquerades as a code regression. Cost a false-alarm loop
  tonight. Kill dev first, build, restart.
- **Never trust `cmd | tail` exit codes** — check the build's own exit.

## Where it stands

frontend 77/77, lint clean, production build verified clean (dev server
stopped first), both-theme sweep 120/120 cells clean, 18/18 functional walks
pass, /qa preview routes deleted before commit. Backend untouched.
