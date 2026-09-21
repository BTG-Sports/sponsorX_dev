# `/brief` sponsor brief-request wizard — design spec

**Date:** 2026-09-21 · **Task:** the sponsor counterpart of `/join` — the
public brief-request intake that B3 ("sponsor brief → matching → invitation")
later wires to the real API · **Scope:** fixtures-only, localStorage draft,
no POST.

## Why

Phase 1 is a managed marketplace: sponsors don't self-signup or check out —
they tell BTG the goal, budget and market, and BTG matches, prices and
handles paperwork (§13). The public journey for that today dead-ends at
`/packages`' inert "Request a brief" buttons (`title="not wired (B3)"`).
This builds the intake those buttons deserve. No ART deliverable exists for
it (Phase 2's 2S0-ART-01 is the self-service flow), so this design follows
the P1-ART-07 wizard language — **led by sponsor orange (`--sx-accent`)
instead of athlete blue** — reusing the `sx-join-*` motion system wholesale.

## Route & entry

- `src/app/(public)/brief/page.tsx` — public, split-stage on `lg+` exactly
  like `/join` (sticky brand panel + 430px elevated card).
- `/packages` cards' "Request a brief" → `Link href="/brief?package=<id>"`
  (prefills step 2's package). The explainer row stays.
- `?demo=submitted` lands on the submitted state.

## Flow — four steps + submitted (`src/lib/brief-flow.ts`, pure + tested)

1. **Goal & category** — goal chips (Awareness, Foot traffic, Product launch,
   Event push), brand category (text, required), success note (optional).
2. **Budget & package** — budget-band chips (Under $1k, $1–3k, $3–8k,
   $8–20k, $20k+ — spanning the §7 package price points), package select
   seeded from `marketplacePackages` (prefilled from `?package=`, "Not sure
   yet" allowed), timing (text, e.g. "March, flexible").
3. **Market** — city/region (required), audience note (optional).
4. **Company & contact** — company (required), your name (required), work
   email (required, must contain `@`), phone (optional).

Submitted: "Brief received — a person at BTG reviews it and comes back with
a matched shortlist, usually within 2 business days." Timeline: Received →
Matching (BTG staff, §13) → Proposal. Trust line: **no card, no checkout,
no commitment — a proposal to react to.** "Review your request" read-only.

Draft: `sx-brief-draft-v1`, same parse/serialize discipline as join
(malformed → null). Chips are single-select (goal, budget). Validation per
step; submit is enabled once step 4 validates (no agreement gate — nothing
is signed; it's a request, not a contract).

## Visual

Same stage glow, rail-less intro **skipped entirely** — four steps don't
need a flow map; the wizard opens directly on step 1 (the packages page IS
the intro). Progress = 4 segments, all accent-toned. CTAs `bg-accent`
(`text-cta-ink` — the restrictions step precedent). Step transitions, field
cascade, saved-dot theatre, drawn submitted check: all reused `sx-join-*`
classes — **zero new CSS**.

Desktop panel copy: "Brief BTG once — get a matched shortlist back." +
trust notes (No card, no checkout · Conflicts checked before you see a name
(§26) · A person replies, usually within 2 business days).

## Files

| Unit | Purpose |
|---|---|
| `src/lib/brief-flow.ts` | Steps, chips, package options (from fixtures), validation, draft. |
| `src/components/brief-wizard.tsx` | The island: step state, chips + fields, progress, submitted view (timeline inline — small enough not to split). |
| `src/app/(public)/brief/page.tsx` | Split-stage frame, `?package=` + `?demo=` seeding. |
| `src/app/(public)/packages/page.tsx` | Buttons become `Link`s to `/brief?package=<id>`. |
| `tests/brief-flow.test.ts` | Validation, draft round-trip, package prefill fallback. |

## Testing

vitest: step validation (required fields, email `@`, unknown package id →
"unsure"), draft round-trip + garbage rejection. Driven: `/brief` SSRs step
1; `?package=pk4` prefills Community Campaign; `?demo=submitted` shows the
timeline; packages page links carry the id; `tsc`/lint/build clean.
