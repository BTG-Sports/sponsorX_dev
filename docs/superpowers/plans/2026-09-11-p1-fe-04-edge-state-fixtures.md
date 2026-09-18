# P1-FE-04 Edge-State Fixtures Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make six edge cases representable and rendered on fixtures: minor with unverified guardian, expired invite, under-delivering campaign, held earning, declined order, rejected application.

**Architecture:** Append-only keyed extensions to `src/lib/fixtures.ts` per the A2 convention; a `"minor"` value added to the `?demo=` switcher for the athlete portal; the admin campaign detail becomes id-resolved via a keyed `campaignDetailX` record (c1 default, reusing existing exports). Rendering reuses `states.tsx`, `BlockedNotice`, `Badge` and `MiniChip` — no new components, no new deps.

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript, Tailwind tokens. **No test runner exists in this repo** — the verification gates are `npx tsc --noEmit`, `npx eslint src`, `npx next build`, and a `next start` curl smoke test, exactly as A2 did. Spec: `docs/superpowers/specs/2026-09-11-p1-fe-04-edge-state-fixtures-design.md`.

**Fixture invariants (read before any task):**
- Append-only: never change an existing row's values or ids. Adding a *field* to every row of one array (`declineReason`) is the one sanctioned schema extension.
- `athleteCareer.openInvites` / `openInviteValueCents` / `nextExpiry` stay unwired.
- Every number keeps a named retrieval path; provenance chips stay on stats.
- Cross-surface arithmetic (Task 5) must hold exactly — it is checked in Task 6.

---

### Task 1: Rejected + minor application rows (cases 6 and 1-admin)

The admin applications page (`src/app/(app)/admin/applications/page.tsx`) already renders `REJECTED` badges, `Minor · §4` chips, guardian-pending badges and a §4-disabled Approve button — no page change is needed. Only fixture rows exercise them.

**Files:**
- Modify: `src/lib/fixtures.ts` (the `applications` array, ends near line 840)

- [ ] **Step 1: Append two rows to `applications`**

Immediately before the closing `];` of `export const applications = [` add:

```ts
  {
    id: "app_5",
    name: "Devon Price",
    slug: "devon-price",
    sport: "Football",
    region: "Alexandria, VA",
    submittedAt: "6 days ago",
    state: "REJECTED" as ApplicationState,
    isMinor: false,
    guardianVerified: null as boolean | null,
    followers: 3_900,
    flags: [
      "Category conflict — active exclusivity with a competing apparel brand (§26)",
    ] as string[],
    score: {
      total: 38,
      method: "rules-v1",
      factors: [
        { label: "Engagement", value: 41 },
        { label: "Content quality", value: 35 },
        { label: "Audience", value: 22 },
        { label: "Reliability", value: 48 },
        { label: "Geography", value: 74 },
        { label: "Fit", value: 18 },
      ],
    },
  },
  {
    id: "app_6",
    name: "Tyler Nguyen",
    slug: "tyler-nguyen",
    sport: "Soccer",
    region: "Rockville, MD",
    submittedAt: "3 days ago",
    state: "SUBMITTED" as ApplicationState,
    isMinor: true,
    guardianVerified: false as boolean | null,
    followers: 12_800,
    flags: [
      "Guardian authorization pending — cannot go ACTIVE until verified (§4)",
    ] as string[],
    score: {
      total: 61,
      method: "rules-v1",
      factors: [
        { label: "Engagement", value: 66 },
        { label: "Content quality", value: 63 },
        { label: "Audience", value: 47 },
        { label: "Reliability", value: 58 },
        { label: "Geography", value: 82 },
        { label: "Fit", value: 60 },
      ],
    },
  },
```

Match the existing rows' field order and casts exactly (`as ApplicationState`, `as boolean | null`, `as string[]`) so the array's element type stays uniform. `app_6.state` is `SUBMITTED` deliberately: it lands in the review queue where the §4-disabled Approve button renders.

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/lib/fixtures.ts`
Expected: both clean.

- [ ] **Step 3: Render check**

Run: `npx next dev -p 3399` in background, then
`curl -s http://localhost:3399/admin/applications | grep -o "Devon Price\|Tyler Nguyen\|Minor · §4\|Guardian authorization pending"`
Expected: all four markers appear. Kill the dev server after.

- [ ] **Step 4: Commit**

```bash
git add src/lib/fixtures.ts
git commit -m "feat(P1-FE-04): rejected + minor applicant rows in admin queue"
```

---

### Task 2: `?demo=minor` — switcher value and `athleteMinor` fixture (case 1-athlete, part 1)

**Files:**
- Modify: `src/lib/demo.ts`
- Modify: `src/lib/fixtures.ts` (after the `athlete` object, ~line 51)

- [ ] **Step 1: Extend the demo union**

In `src/lib/demo.ts` replace the type and the guard:

```ts
export type DemoState = "loading" | "empty" | "error" | "minor" | null;
```

```ts
  return d === "loading" || d === "empty" || d === "error" || d === "minor"
    ? d
    : null;
```

Extend the header comment's first line to: `?demo=loading|empty|error|minor` and append a sentence: `"minor" is athlete-portal-only: it renders the signed-in athlete as a minor with guardian verification pending (§4); other portals ignore it.`

- [ ] **Step 2: Add `athleteMinor` to fixtures**

Immediately after the `export const athlete = { ... };` object add:

```ts
/** §4 — the same athlete rendered as a minor whose guardian is not yet
 *  verified. Selected by ?demo=minor on athlete-portal pages; the base
 *  `athlete` object is untouched and remains the default. */
export const athleteMinor = {
  ...athlete,
  isMinor: true,
  guardian: {
    legalName: "Immaculée Kwizera",
    verifiedAt: null as string | null,
  },
};
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/demo.ts src/lib/fixtures.ts
git commit -m "feat(P1-FE-04): demo=minor switcher value + athleteMinor fixture"
```

---

### Task 3: Athlete dashboard renders the minor (case 1-athlete, part 2)

**Files:**
- Modify: `src/app/(app)/athlete/page.tsx`

- [ ] **Step 1: Select the athlete by demo state**

Add `athleteMinor` to the fixtures import. Directly after the existing `const demo = await demoState(searchParams);` line add:

```ts
  const a = demo === "minor" ? athleteMinor : athlete;
```

Then replace every `athlete.` reference in this component with `a.` (heading name/sport/position/region/school, tier badges, hero `a.firstName`, profile completion, and the guardian side-rail section at the bottom that keys off `athlete.isMinor`). The guardian side-rail card lights up automatically once `a` is the minor.

Note: `heading` is built before the `demo === "empty"` early return — define `a` before `heading` so the empty state also shows the right athlete.

- [ ] **Step 2: Guardian notice strip**

Directly under the compliance strip block (the `{outstanding.length > 0 && (...)}` element), add:

```tsx
      {a.isMinor && !a.guardian?.verifiedAt && (
        <BlockedNotice>
          Guardian authorization pending — {a.guardian?.legalName} must be
          verified before {a.firstName} can accept an invitation or submit a
          deliverable (§4). Invitations stay open; nothing is lost while
          verification completes.
        </BlockedNotice>
      )}
```

- [ ] **Step 3: Gate the deliverable action**

In the deliverables list, replace the `{d.state === "NOT_STARTED" ? (...) : (...)}` action with:

```tsx
                      {d.state === "NOT_STARTED" ? (
                        <Button
                          variant="secondary"
                          disabled={a.isMinor && !a.guardian?.verifiedAt}
                          title={
                            a.isMinor && !a.guardian?.verifiedAt
                              ? "Blocked: a minor needs a verified guardian first (§4)"
                              : undefined
                          }
                        >
                          Upload proof
                        </Button>
                      ) : (
                        <Button variant="ghost">View</Button>
                      )}
```

(The invitation Accept buttons are already disabled by the counsel block; the strip carries the guardian message.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/athlete/page.tsx"`
Expected: clean.
Run dev server, then:
`curl -s "http://localhost:3399/athlete?demo=minor" | grep -o "Guardian authorization pending\|Immaculée Kwizera\|Verification pending"`
Expected: all three markers. Also `curl -s http://localhost:3399/athlete | grep -c "Guardian authorization pending"` → `0` (default render unchanged).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/athlete/page.tsx"
git commit -m "feat(P1-FE-04): athlete dashboard minor variant via demo=minor"
```

---

### Task 4: Invitations notice + order page minor/terminal states (cases 1, 2, 5-athlete)

**Files:**
- Modify: `src/lib/fixtures.ts` (`invitations` array)
- Modify: `src/app/(app)/athlete/invitations/page.tsx`
- Modify: `src/app/(app)/athlete/orders/[id]/page.tsx`

- [ ] **Step 1: `declineReason` schema extension on `invitations`**

Add `declineReason: null as string | null,` to **every** row of `invitations` (after `exclusivity`), except `inv_5` (the `DECLINED` row) which gets:

```ts
    declineReason:
      "Declined May 4 — scheduling conflict with the state playoff window.",
```

No other field or id changes.

- [ ] **Step 2: Guardian notice on the invitations page**

In `src/app/(app)/athlete/invitations/page.tsx`, import `athleteMinor` from fixtures. Directly after the headline `<div>` block (before the filter bar), add:

```tsx
      {demo === "minor" && (
        <BlockedNotice>
          Guardian authorization pending (§4) — invitations can be reviewed
          but not accepted until {athleteMinor.guardian.legalName} is
          verified.
        </BlockedNotice>
      )}
```

Note `demo === "minor"` must fall through to the normal render (it already does — only `loading`/`error`/`empty` return early).

- [ ] **Step 3: Order page — demo param + athlete selection**

In `src/app/(app)/athlete/orders/[id]/page.tsx`:

Change the `searchParams` prop type to the shared shape and resolve `from` defensively, and add the demo call. Replace:

```ts
  searchParams: Promise<{ from?: string }>;
```
with:
```ts
  searchParams: Promise<Record<string, string | string[] | undefined>>;
```
and replace `const { from } = await searchParams;` with:

```ts
  const sp = await searchParams;
  const from = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const demo = await demoState(searchParams);
  const a = demo === "minor" ? athleteMinor : athlete;
```

Add imports: `demoState` from `@/lib/demo`, `athleteMinor` from `@/lib/fixtures`. Replace the two `athlete.` uses in the guardian card (`athlete.isMinor`, `athlete.firstName`, `athlete.guardian`) with `a.`.

- [ ] **Step 4: Order page — terminal-state side rail**

Replace the entire "Accept this order" `<Card>` (the one containing the accept/decline buttons and the `BlockedNotice`) with a state-aware block:

```tsx
          {actionable ? (
            <Card>
              <SectionHeading title="Accept this order" />
              <div className="space-y-2">
                <Button
                  full
                  disabled
                  title="Blocked: the Campaign Order template needs counsel approval (guide §08)"
                >
                  Review &amp; accept
                </Button>
                <Button variant="secondary" full href="/athlete/invitations">
                  Decline
                </Button>
              </div>

              <BlockedNotice>
                Acceptance is not wired. Guide §08 blocks it until counsel
                approves the Campaign Order template — the acceptOrder domain
                function (B4) hashes whatever text it is shown.
              </BlockedNotice>
            </Card>
          ) : (
            <Card>
              <SectionHeading title="Order status" />
              <Badge tone={STATE_TONE[inv.state]}>
                {INVITE_COPY[inv.state]}
              </Badge>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {inv.state === "DECLINED" &&
                  (inv.declineReason ??
                    "This invitation was declined; no Campaign Order was created.")}
                {inv.state === "EXPIRED" &&
                  "This invitation expired before a response. The sponsor can re-invite through BTG."}
                {inv.state === "ACCEPTED" &&
                  "This order is live — its deliverables are tracked on your dashboard."}
              </p>
              <div className="mt-3">
                <Button variant="secondary" full href="/athlete/invitations">
                  Back to invitations
                </Button>
              </div>
            </Card>
          )}
```

This is the terminal declined-order state the spec requires: reason shown, no accept affordance, back-link to invitations.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/athlete/invitations/page.tsx" "src/app/(app)/athlete/orders/[id]/page.tsx" src/lib/fixtures.ts`
Expected: clean.
Dev server curls:
- `curl -s "http://localhost:3399/athlete/orders/inv_5?from=athlete-invitations" | grep -o "scheduling conflict\|Order status"` → both.
- `curl -s "http://localhost:3399/athlete/orders/inv_6" | grep -o "expired before a response"` → present (expired invite, case 2, now has a terminal treatment too).
- `curl -s "http://localhost:3399/athlete/orders/inv_1?demo=minor" | grep -o "Guardian verification pending"` → present.
- `curl -s "http://localhost:3399/athlete/invitations?demo=minor" | grep -o "Guardian authorization pending"` → present.
- `curl -s "http://localhost:3399/athlete/invitations" | grep -o "Expired"` → present (case 2 verification on the inbox).

- [ ] **Step 6: Commit**

```bash
git add src/lib/fixtures.ts "src/app/(app)/athlete/invitations/page.tsx" "src/app/(app)/athlete/orders/[id]/page.tsx"
git commit -m "feat(P1-FE-04): declined/expired order terminal states + minor gating on invites"
```

---

### Task 5: Held earning, athlete side (case 4)

**Files:**
- Modify: `src/lib/fixtures.ts` (`earnings`, `earningItems`)
- Modify: `src/app/(app)/athlete/earnings/page.tsx`

- [ ] **Step 1: Fixture rows**

Append to `export const earnings = [` (before `];`):

```ts
  { state: "HELD" as EarningState, label: "Held", amount: 12_000, count: 1 },
```

Append to `export const earningItems = [` (before `];`):

```ts
  { id: "ern_7", athlete: "Shammah Kwizera", campaign: "Skills Lab Series", jobId: "SX-02", jobName: "Sponsored Post", amount: 12_000, state: "HELD" as EarningState, reference: null, updatedAt: "May 17" },
```

Then after the `earnings` array add:

```ts
/** §21 — why the held order is held; shown beside the state list. One held
 *  order (ern_7), so one note. */
export const heldNote =
  "Skills Lab Series — the published proof failed verification; BTG Finance is re-checking the post URL before this earning can move again (§21).";
```

Why these values: `12_000` in both places (the cycle bucket **is** ern_7, count 1 — athlete page and admin finance can never disagree); campaign is "Skills Lab Series" (`c4`, COMPLETED — a real past campaign, and **not** "Spring Open House", which Shammah *declined* in `inv_5`; a held earning on a declined campaign would be a contradiction).

- [ ] **Step 2: Render the reason on the earnings page**

In `src/app/(app)/athlete/earnings/page.tsx`, add `heldNote` to the fixtures import. In the "This cycle by state" side-rail card, directly after the `</ul>` that lists the per-state rows, add:

```tsx
            <p className="mt-2 rounded-lg border border-danger/25 bg-danger/8 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
              {heldNote}
            </p>
```

(The dashboard side rail and the "Recent orders" table pick the new rows up automatically — `earnings.map` and the `mine` filter.)

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/athlete/earnings/page.tsx" src/lib/fixtures.ts`
Expected: clean.
Dev server curls:
- `curl -s http://localhost:3399/athlete/earnings | grep -o "Held\|Skills Lab Series"` → both.
- `curl -s http://localhost:3399/admin/finance | grep -o "ern_7\|Skills Lab Series"` → "Skills Lab Series" present (admin finance shows the same held order).

- [ ] **Step 4: Commit**

```bash
git add src/lib/fixtures.ts "src/app/(app)/athlete/earnings/page.tsx"
git commit -m "feat(P1-FE-04): held earning on athlete earnings, reconciled with admin finance"
```

---

### Task 6: Canonical under-delivering campaign c3 + declined roster entry (cases 3 and 5-admin)

**Files:**
- Modify: `src/lib/fixtures.ts` (after `campaignRoster`, ~line 520)
- Modify: `src/app/(app)/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Keyed campaign-detail fixture**

After the `campaignRoster` export add:

```ts
/** §9.9 keyed by campaign id. c1 stays the canonical healthy campaign and
 *  reuses the existing exports untouched. c3 "Community Campaign" is THE
 *  under-delivering campaign (sponsorCampaignsX.c3 is pacing BEHIND):
 *  views here (96,200) equal sponsorCampaignsX.c3.views; roster
 *  delivered/planned sums to 11/22 = sponsorCampaigns c3 deliverables;
 *  per-athlete views sum to the campaign total. One declined order on the
 *  roster is part of why it under-delivers. */
export const campaignDetailX: Record<
  "c1" | "c3",
  {
    campaign: typeof campaign;
    series: typeof campaignSeries;
    topContent: typeof topContent;
    roster: typeof campaignRoster;
    notice: string | null;
  }
> = {
  c1: {
    campaign,
    series: campaignSeries,
    topContent,
    roster: campaignRoster,
    notice: null,
  },
  c3: {
    campaign: {
      id: "c3",
      name: "Community Campaign",
      presentedBy: "Under Armour",
      state: "ACTIVE",
      daysRemaining: 45,
      viewsDelivered: 96_200,
      viewsTarget: 400_000,
      engagements: 4_910,
      rewardsRedeemed: 214,
      tabs: campaign.tabs,
    },
    series: [
      { label: "Jul 1", a: 0, b: 0 },
      { label: "Jul 15", a: 18_400, b: 940 },
      { label: "Aug 1", a: 44_100, b: 2_260 },
      { label: "Aug 15", a: 71_800, b: 3_680 },
      { label: "Sep 1", a: 96_200, b: 4_910 },
    ],
    topContent: [
      { title: "Community Day — Recap Reel", athlete: "Marcus Reed", views: 38_900 },
      { title: "Coach's Corner — Ep. 2", athlete: "Jalen Brooks", views: 24_300 },
      { title: "Neighborhood Clinic — Story", athlete: "Marcus Reed", views: 18_100 },
    ],
    roster: [
      { name: "Marcus Reed", slug: "marcus-reed", order: "ACCEPTED", delivered: 8, planned: 8, views: 57_000, flag: null },
      { name: "Jalen Brooks", slug: "jalen-brooks", order: "ACCEPTED", delivered: 3, planned: 8, views: 39_200, flag: "Under-delivering" },
      { name: "Amara Okafor", slug: "amara-okafor", order: "DECLINED", delivered: 0, planned: 6, views: 0, flag: "Replacement needed" },
    ],
    notice:
      "11 of 22 deliverables landed and views are pacing behind target — one Campaign Order was declined and one athlete is under-delivering. Re-match the declined slot or adjust the order (§9.9).",
  },
};
```

Arithmetic that must hold (check by hand before committing): roster delivered 8+3+0 = 11 and planned 8+8+6 = 22 (= `sponsorCampaigns` c3 `deliverables: [11, 22]`); roster views 57,000+39,200 = 96,200 (= `sponsorCampaignsX.c3.views` = `viewsDelivered`); each athlete's top-content views sum ≤ that athlete's roster views (Marcus 38,900+18,100 = 57,000 ✓, Jalen 24,300 ≤ 39,200 ✓).

- [ ] **Step 2: Resolve by id in the admin campaign page**

In `src/app/(app)/admin/campaigns/[id]/page.tsx`:

Replace the fixtures import block with:

```ts
import { campaignDetailX } from "@/lib/fixtures";
```

and add `BlockedNotice` to the `@/components/ui` import. Replace `const c = campaign;` with:

```ts
  const d =
    campaignDetailX[id as keyof typeof campaignDetailX] ?? campaignDetailX.c1;
  const c = d.campaign;
```

Then replace the three remaining direct uses: `points={campaignSeries}` → `points={d.series}`, `topContent.map` → `d.topContent.map`, `campaignRoster.map` → `d.roster.map`.

- [ ] **Step 3: Warning notice + declined badge tone**

Directly after the stat-cards grid (`</div>` closing the four cards), add:

```tsx
      {d.notice && <BlockedNotice>{d.notice}</BlockedNotice>}
```

In the roster table, replace the order badge line:

```tsx
                      <Badge tone={r.order === "ACCEPTED" ? "accent" : "warn"}>
```
with:
```tsx
                      <Badge
                        tone={
                          r.order === "ACCEPTED"
                            ? "accent"
                            : r.order === "DECLINED"
                              ? "danger"
                              : "warn"
                        }
                      >
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/admin/campaigns/[id]/page.tsx" src/lib/fixtures.ts`
Expected: clean.
Dev server curls:
- `curl -s "http://localhost:3399/admin/campaigns/c3?from=admin" | grep -o "Community Campaign\|Replacement needed\|Under-delivering\|11 of 22"` → all four.
- `curl -s "http://localhost:3399/admin/campaigns/c1?from=admin" | grep -o "Player of the Week"` → present (c1 unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fixtures.ts "src/app/(app)/admin/campaigns/[id]/page.tsx"
git commit -m "feat(P1-FE-04): canonical under-delivering campaign c3 + declined roster order"
```

---

### Task 7: Closing verification matrix

**Files:** none modified — gates only.

- [ ] **Step 1: Build gates**

Run: `npx tsc --noEmit` → clean. `npx eslint src` → 0 errors (1 pre-existing warning in `src/app/t/[code]/route.ts` is allowed). `npx next build` → all routes green.

- [ ] **Step 2: Production smoke test**

Run `npx next start -p 3311` (background), then every demo URL with its marker:

| URL | Marker |
|---|---|
| `/admin/applications` | `Devon Price`, `Tyler Nguyen`, `Rejected` |
| `/athlete?demo=minor` | `Guardian authorization pending` |
| `/athlete` | must NOT contain `Guardian authorization pending` |
| `/athlete/invitations` | `Expired` |
| `/athlete/invitations?demo=minor` | `Guardian authorization pending` |
| `/athlete/orders/inv_5?from=athlete-invitations` | `scheduling conflict` |
| `/athlete/orders/inv_6` | `expired before a response` |
| `/athlete/orders/inv_1?demo=minor` | `Guardian verification pending` |
| `/athlete/earnings` | `Held`, `Skills Lab Series` |
| `/admin/campaigns/c3?from=admin` | `Replacement needed`, `Under-delivering` |
| `/admin/campaigns/c1?from=admin` | `Player of the Week` |

All 200s. Kill the server after.

- [ ] **Step 3: Acceptance criteria check against the phase plan**

"A minor athlete with unverified guardian, an expired invite, an under-delivering campaign, a held earning, a declined order and a rejected application are all representable and rendered" — walk the table above and confirm each of the six maps to at least one rendered URL.

- [ ] **Step 4: Log + tracker**

Append a Task entry to `Memory/2026-09-11/tasks-completed.md` (or today's folder if the date rolled) covering: what shipped, the demo-URL table, and the c3 arithmetic invariant. Update the task board xlsx: `P1-FE-04` → `Code review` (or `Done` after review), `Date Done`, keep Owner. Remind the user the Google Sheet mirror is their end-of-day hand step.
