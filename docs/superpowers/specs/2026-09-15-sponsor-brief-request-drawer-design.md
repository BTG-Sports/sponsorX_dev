# Sponsor brief-request drawer — design (2026-09-15)

## Problem

On `/sponsor/marketplace`, the packages **"Request a brief"** button and the
athlete inventory **"Add to brief"** button are decorative stubs
(`title="… not wired"`). They are the front door to the managed-marketplace loop
(§9 screen 4, §13, §17):

```
sponsor brief → matching → invitation → Campaign Order → deliverable → … → sponsor report
```

The whole flow is documented but Blocked in the task board — Stage 4 (`P4-FE-01`
"Wire the sponsor marketplace and brief submission") depends on the backend
`CampaignBrief` model (`P4-BE-02`), which does not exist yet. There is **no
brief UI anywhere in the codebase**.

## Goal

Build the **frontend** of brief submission only — a demo-quality drawer that
makes the loop's entry point feel real for the PM demo, honoring the
managed-marketplace rule ("request, we call you — not self-service checkout").
**Nothing is persisted**; no backend, no fixture campaign side effects.

Out of scope: the `CampaignBrief` model/state machine, matching, invitations,
any real submission, the media tab, a multi-step wizard, draft autosave.

## Approach

One new client component, `src/components/brief-request-drawer.tsx`, wired into
the existing `marketplace-catalog.tsx` client island. Chosen over a centered
modal (campaign-launcher) because the form is short and single-step; a
right-side drawer keeps the catalogue visible behind it. Reuses the established
drawer plumbing verbatim from `applications-desk.tsx`.

## Component: `BriefRequestDrawer`

**Presentation.** Portaled to `<body>`, `role="dialog" aria-modal="true"`,
`sx-drawer` slide-in / `sx-drawer-out` slide-out, `sx-backdrop` click-away,
`absolute inset-y-0 right-0 w-full max-w-md border-l`. Escape closes, body scroll
locks, focus lands on the first field and returns to the trigger on close, with
the same fallback-timer unmount the review drawer uses. Sponsor-toned.

**Props.**

```ts
type BriefSeed =
  | { kind: "package"; name: string; price: string; sport?: undefined }
  | { kind: "athlete"; name: string; sport: string; jobName: string; sellPrice: number };

{ seed: BriefSeed | null; onClose: () => void }
```

`seed === null` ⇒ closed. A non-null `seed` opens the drawer; the parent clears
it to close. Each open mounts fresh form state (drawer keyed on an open counter
or seed identity) so reopening is a clean slate.

**Context header (pinned).** Shows what's being requested:
- package seed → monogram + package name + price, labelled "Package".
- athlete seed → circle monogram + athlete name + job, shown as a "Requested
  athlete" chip. Sport pre-fills targeting.

**Form fields** (exactly the `CampaignBrief` fields §13 / `P4-BE-02` names):

| Field | Behavior |
|---|---|
| Objective | required · textarea |
| Budget | required · text · seeded from package price or `money(sellPrice)` |
| Timing | start date (`<input type=date>`) + duration select (2 / 4 / 8 / 12 weeks) |
| Targeting — Sport | dropdown · options from `distinct(athleteInv.sport)` · pre-filled for athlete seed |
| Targeting — Geography | dropdown · options from `distinct(athleteInv.geo)` |
| Targeting — Tier | dropdown · options from `distinct(athleteInv.tier)` |
| Category | text · the field the competitor-conflict check needs |
| Message | optional · textarea · note to BTG |

Dropdowns reuse `filter-kit`'s `Dropdown` (sponsor tone). Budget shows sponsor
prices only — `AthleteRate.amount` never enters this component.

**Submit.** Enabled only when Objective and Budget are non-empty. On click the
form body swaps to a success state (no network): check mark + "Brief received.
BTG will match eligible athletes, price it, run conflict checks and follow up —
Phase 1 is managed, there's no self-service checkout (§17)." A "Done" button
calls `onClose`. A fixed sub-line under the header makes clear throughout that
this is a *request, not a purchase*.

## Wiring into `marketplace-catalog.tsx`

`PackagesCatalog` and `AthleteCatalog` each gain one
`const [seed, setSeed] = useState<BriefSeed | null>(null)` and render a single
`<BriefRequestDrawer seed={seed} onClose={() => setSeed(null)} />`.

- Packages "Request a brief" button → `onClick={() => setSeed({ kind: "package",
  name: p.name, price: p.price })}` (drops the `title` stub).
- Athletes "Add to brief" button → `onClick={() => setSeed({ kind: "athlete",
  name: a.athlete, sport: a.sport, jobName: a.jobName, sellPrice: a.sellPrice })}`
  (still disabled + "Join waitlist" when `SOLD_OUT`).

The `MediaCatalog` is untouched.

## Data / fixtures

No fixture or backend changes. Targeting options derive from `athleteInv` the
same way the catalog filters do (`distinct`). Timing durations are a local
constant. Geography options come from `distinct(athleteInv.geo)`.

## Testing / verification

`tsc --noEmit` clean · `eslint` clean. Dev SSR + manual: clicking "Request a
brief" opens the drawer with the package pinned and budget seeded; clicking
"Add to brief" opens it with the athlete pinned and sport pre-filled; Submit is
disabled until Objective + Budget are set; submitting shows the success state;
Escape / backdrop / Done all close and restore focus; reopening is a clean
slate; nothing persists across reloads.
