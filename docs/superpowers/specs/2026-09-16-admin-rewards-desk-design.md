# Admin Rewards desk + modal Reward Creator — design (2026-09-16)

## What the user asked for

Three messages, one flow:

1. Redesign `/admin/rewards/new` with wow factor and award-quality visuals,
   but an easy learning curve.
2. The rewards page should show the **list first** — search, filter, sorting,
   item list — before creation.
3. Creating a reward should be a **popup**, not a new page.

## Decision

The list leads at **`/admin/rewards`** (new route, nav repointed), and the
creator becomes a three-step wizard inside the campaign-launcher's
near-full-screen modal. `/admin/rewards/new` survives as a redirect to
`/admin/rewards?new=1`, which opens the modal on load — nav history, the
campaign builder's "Design the full reward" link and bookmarks keep working.

## Components

### `RewardsDesk` (`src/components/rewards-desk.tsx`, client island)

The applications-desk idiom applied to §16 fan rewards:

- **Funnel strip** — Active rewards / QR scans / Claims / Redeemed, summed
  from the rows' RewardEvent counts so it reconciles with `rewardFunnel`
  (8,200 / 4,300 / 1,870) **by construction**; provenance line names §16's
  four separate events and links to `/admin/analytics`.
- **Toolbar** — instant search (offer/sponsor), status dropdown
  (Active / Scheduled / Draft / Expired / Pending legal), redemption-type
  dropdown, sort menu (newest, redemptions, scans, redemption rate, offer
  A–Z), and the **Create reward** trigger.
- **Cards** — deterministic hash-seeded QR thumbnail (greyed when not ACTIVE),
  offer + state badge, sponsor · type, token count and expiry, and either the
  scans → claims → redeemed line with a redemption-rate `Meter`, or (for
  zero-traffic rows) the plain-English `REWARD_COPY` state line.
- **Pagination** — shared numbered pager, 12/24/60 page size, bars duplicated
  above and below, bottom dropdown opens upward.
- **URL-synced** — `?q=&status=&type=&sort=&page=&size=` via `replaceState`,
  `?demo=` preserved, seeded back by the server page. `?new` is read once and
  never written back, so the redirect leaves a clean URL.
- **Local create** — the modal's wizard hands up a `CreatedReward`; the desk
  prepends it as SCHEDULED with an sx-pop highlight and an Undo toast.
  Demo-only; nothing persists.

### `RewardCreator` (`src/components/reward-creator.tsx`, client island)

Three steps (`rewardSteps`), campaign-builder mechanics (clickable stepper
with furthest-reached gating, `sx-animate` re-key per step, gates explained in
plain English under the button):

1. **What is the reward?** — sponsor chips, offer input + quick chips,
   redemption types as **explained cards** (each §16 model gets one line;
   sweepstakes rendered blocked with "Needs legal" — §16 honesty, not
   hidden), expiration chips, §26 terms.
2. **Design the fan card** — subhead / footer text, three theme swatches;
   headline locked to the offer.
3. **Who hands it out?** — athlete picker (conflicted athletes blocked
   visibly, §26); each selected athlete shows their opaque token stand-in —
   one reward, many tokens (§16).

**The wow that teaches:** a sticky phone-framed live preview of the exact fan
card, re-rendering on every keystroke, with a hash-seeded QR that visibly
re-patterns as the design changes. Cause and effect stay on screen the whole
time — that is the learning curve.

Determinism rule: tokens and QR cells derive from an FNV-1a hash of the
content (no `Math.random`), so SSR and client render identically and the same
design always draws the same QR. Real tokens/QRs are generated into R2 on
save.

## Fixtures

`rewards` (14 rows), `RewardState`, `REWARD_COPY`, `REWARD_TYPES` in
`src/lib/fixtures.ts`. Event counts across the rows sum exactly to
`rewardFunnel`; only rows with fan traffic contribute (drafts / scheduled /
pending-legal are zeros), which is why the sums close (§22: every number has
a source).

## Verification

`tsc --noEmit` clean, eslint clean, `next build` passes (both routes
dynamic). Against `next start`: list SSR renders funnel numbers, 12 QR cards
and both pager bars; `?status=ACTIVE&q=grill` seeds to 2 cards; `?demo=empty`
shows the empty state; `/admin/rewards/new` serves the redirect (meta-refresh
on cold document loads — this Next emits that in streaming contexts — and an
instant client-side redirect in-app).
