# P1-FE-04 — Edge-state fixtures: design

**Date:** 2026-09-11 · **Task:** `P1-FE-04` (Phase 1, Stage 1, Order 28) ·
**Branch:** `P1-FE-QA-PMO`

## Goal

The fixtures show happy paths. Make the six awkward cases representable **and
rendered**, so the screens are designed for reality before real data exists:

1. A minor athlete with an unverified guardian
2. An expired invite
3. An under-delivering campaign
4. A held earning
5. A declined order
6. A rejected application

Acceptance (from the phase plan): all six representable and rendered.
Reference: Roadmap A3, §4, §9.9, §26.

## Decisions taken with the user

- **Minor/guardian (option B):** admin-side applicant row **plus** an
  athlete-portal `?demo=minor` variant. No second persona.
- **Declined order (option C):** both an order-level roster entry on the admin
  campaign detail **and** an athlete-side declined order detail state.
- **Under-delivery (option B):** one canonical under-delivering campaign —
  `c3` "Community Champions" — surfaced consistently on sponsor portfolio,
  admin campaign detail and roster. No ROI-report re-plumbing.
- **Approach:** append-only keyed extensions, per the A2 / sponsor-redesign
  convention. No fixture restructure — fixtures die when real data arrives.

## Design

### 1. Rejected application

Append one row to `applications`: state `REJECTED`, a concrete rejection
reason in `flags`, and a low `rules-v1` score so the rejection is
self-explanatory. Renders in the admin applications queue via
`APPLICATION_COPY.REJECTED`; the admin detail treatment must show a terminal
state (no review actions).

### 2. Minor with unverified guardian

- **Admin:** append a second `applications` row with `isMinor: true`,
  `guardianVerified: false` and a "Guardian authorization pending" flag — the
  queue shows why the application cannot advance.
- **Athlete portal:** extend `DemoState` in `src/lib/demo.ts` with `"minor"`.
  On athlete pages, `?demo=minor` overlays the `athlete` fixture with
  `isMinor: true, guardian: { legalName, verifiedAt: null }` and gates action
  affordances (accept invitation, submit deliverable) behind a
  guardian-pending `BlockedNotice` per §4. The dashboard shows a persistent
  guardian-status notice. Other portals and other `demo` values unchanged;
  absent param = normal render.

### 3. Expired invite

Already representable (`invitations` row with `EXPIRED`, `INVITE_COPY`
exists). Work is **verification only**: the invitations page must render it
distinctly — muted, no accept action. Fix rendering only if it fails this.

### 4. Under-delivering campaign — canonical `c3`

"Community Champions" (`sponsorCampaignsX.c3`, already `pacing: "BEHIND"`) is
*the* under-delivering campaign everywhere:

- Sponsor portfolio row keeps its `PACING BEHIND` chip.
- Admin campaign detail for c3 shows the delivered-vs-planned shortfall, the
  existing flagged roster athlete ("Under-delivering") as the cause, and a
  warning-tinted staff notice ("2 of 6 deliverables landed — re-match or
  adjust order").
- **One set of delivered/planned/views figures, stated once in fixtures,
  consumed by every surface.** No screen may contradict another.

### 5. Held earning (athlete side)

Append a `HELD` bucket to the athlete `earnings` summary with a reason string
(e.g. content verification failed). Amounts stay inside the "this cycle"
framing so `athleteCareer`'s $46,250 story is not contradicted (flagged
landmine). Admin finance already shows `HELD`/`DISPUTED` (`earningItems`
`ern_5`/`ern_6`) — the athlete-side held amount must agree with the admin-side
row for the same athlete, or be clearly a different athlete's.

### 6. Declined order

- **Admin:** append a `DECLINED` entry to `campaignRoster` (`delivered: 0,
  planned: 0`, "Replacement needed" flag), rendered on the admin campaign
  detail where BTG staff re-match.
- **Athlete:** one declined Campaign Order fixture reachable at
  `athlete/orders/[id]` rendering a terminal declined state — decline reason,
  no action buttons, back-link to invitations. It is the same order the
  existing `DECLINED` invitation row refers to: one data story.

## Guardrails

- **Append-only:** existing fixture rows, ids and exports untouched; keyed
  extensions where consumers can't absorb new rows.
- `athleteCareer.openInvites` / `openInviteValueCents` / `nextExpiry` stay
  **unwired** (they contradict live `invitations`; reconciling is out of
  scope).
- Every displayed number keeps a named retrieval path and provenance labeling
  per the standing rule (`stats-must-be-retrievable`).
- Rendering reuses `states.tsx` / `BlockedNotice` / existing chip components;
  new components only where no pattern exists.
- Zero new dependencies; server components stay server components.

## Verification

- `npx tsc --noEmit`, `npx eslint src`, `npx next build` all green
  (21 routes).
- Each of the six cases demonstrable by URL, recorded in the plan:
  admin applications queue (rejected + minor rows), `?demo=minor` athlete
  pages, invitations page (expired, declined), admin campaign detail for c3
  (under-delivery + declined roster entry), athlete earnings (held bucket),
  `athlete/orders/<declined-id>`.
- Cross-surface consistency check: c3 figures identical on sponsor and admin
  surfaces; held amounts agree between athlete and admin finance framing.
