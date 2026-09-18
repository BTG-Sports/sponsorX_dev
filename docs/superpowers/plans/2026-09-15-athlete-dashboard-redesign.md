# Athlete Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/athlete` as a staged, low-density dashboard — slim money strip, teaching journey strip, slim clickable stat tiles, one actionable queue beside a three-card rail — per the approved spec `docs/superpowers/specs/2026-09-15-athlete-dashboard-redesign-design.md`.

**Architecture:** One new client island (`JourneyStrip`, localStorage dismissal) plus a full rewrite of the server-rendered `src/app/(app)/athlete/page.tsx`. All demoted content routes to existing subpages — no new routes, no fixture changes. Demo states (`?demo=loading/error/empty/minor`) preserved exactly.

**Tech Stack:** Next.js App Router (server components + one `"use client"` island), Tailwind with the repo's `sx-*` design tokens, fixtures from `src/lib/fixtures.ts`.

**Note on TDD:** this repo is a fixture-driven UI prototype with **no test infrastructure** (no test runner, no test scripts in `package.json`). Verification is `npm run lint`, `npx tsc --noEmit`, and a dev-server walkthrough of every demo state — spelled out in Task 3.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `src/components/journey-strip.tsx` | Create | Client island: 4-step teaching strip, dismissible, localStorage |
| `src/app/(app)/athlete/page.tsx` | Rewrite | New staged composition (notices → heading → money strip → journey → tiles → queue + rail) |
| `memory/2026-09-15/athlete-dashboard-redesign.md` | Create | Team memory log (CLAUDE.md rule) |
| `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` | Edit | Tracker row for this rework (never committed) |

Design tokens used (all exist in `src/app/globals.css` / current pages): `text-muted`, `text-faint`, `text-text`, `text-accent`, `text-warn`, `border-line`, `border-line-soft`, `bg-surface`, `bg-surface-2`, `athlete` color (`bg-athlete/10`, `text-athlete`, `border-athlete/30`), `sx-animate`, `sx-delay-1..5`.

---

### Task 1: `JourneyStrip` client island

**Files:**
- Create: `src/components/journey-strip.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/* --------------------------------------------------------------------------
   Journey strip — the athlete dashboard's teaching element (spec 2026-09-15).

   Four plain-English steps (Get invited → Accept the deal → Deliver & verify
   → Get paid) with the athlete's current stage highlighted and a live count
   under each step. Dismissible: the ✕ writes localStorage and the strip stays
   gone on future visits — the mental model only needs teaching until it's
   learned.

   Same island conventions as reveal.tsx / count-up.tsx: server page stays the
   source of truth (steps and counts arrive as props), the island only owns
   the dismissed bit. First paint always renders the strip; the useEffect
   hides it post-mount for returning dismissers — a brief flash for them beats
   hiding it from everyone with JS off.
   -------------------------------------------------------------------------- */

const STORAGE_KEY = "sx-athlete-journey-dismissed";

export type JourneyStep = {
  label: string;
  /** Live count line under the label, e.g. "2 waiting". */
  sub: string;
  href?: string;
};

export function JourneyStrip({
  steps,
  current,
}: {
  steps: JourneyStep[];
  /** 0-based index of the athlete's current stage. */
  current: number;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") setHidden(true);
    } catch {
      /* storage unavailable — strip just stays visible */
    }
  }, []);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore — dismissal still applies for this render */
    }
  };

  return (
    <div className="sx-animate flex items-start gap-2 rounded-xl border border-dashed border-line bg-surface px-3 py-3 sm:items-center sm:px-4">
      <ol className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-1">
        {steps.map((s, i) => {
          const state = i < current ? "done" : i === current ? "now" : "next";
          const body = (
            <span className="flex items-center gap-2.5 sm:flex-col sm:gap-1 sm:text-center">
              <span
                className={[
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  state === "done"
                    ? "border-accent/50 text-accent"
                    : state === "now"
                      ? "border-athlete/60 bg-athlete/15 text-athlete"
                      : "border-line text-faint",
                ].join(" ")}
                aria-hidden="true"
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={[
                    "block text-xs leading-tight",
                    state === "now"
                      ? "font-semibold text-text"
                      : state === "done"
                        ? "text-muted"
                        : "text-faint",
                  ].join(" ")}
                >
                  {s.label}
                </span>
                <span className="block text-[10px] leading-tight text-faint">
                  {s.sub}
                </span>
              </span>
            </span>
          );
          return (
            <li key={s.label} className="flex min-w-0 flex-1 items-center gap-1">
              {s.href ? (
                <Link
                  href={s.href}
                  className="min-w-0 flex-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-2/70"
                >
                  {body}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 px-1.5 py-1">{body}</span>
              )}
              {i < steps.length - 1 && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="hidden size-3 shrink-0 text-faint sm:block"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide how it works"
        title="Hide — you can keep working without it"
        className="shrink-0 rounded-md p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors (the component is not imported anywhere yet — that's fine, it must simply typecheck).

- [ ] **Step 3: Commit**

```bash
git add src/components/journey-strip.tsx
git commit -m "feat(athlete): JourneyStrip teaching island — 4-step flow, dismissible via localStorage"
```

---

### Task 2: Rewrite the dashboard page

**Files:**
- Modify (full rewrite): `src/app/(app)/athlete/page.tsx`

What leaves the page entirely (rehoused, per spec): amber onboarding strip, 
§08 acceptance BlockedNotice, invitation Accept/Decline buttons, full 
deliverables table, rate card section, per-state earnings list + trust copy, 
profile checklist card, audience per-platform card, agreements section. What
stays: guardian BlockedNotice, heading, hero (slimmed), empty/minor/loading/
error demo behavior, guardian rail card.

- [ ] **Step 1: Replace the entire file with:**

```tsx
import Link from "next/link";
import {
  Badge,
  BlockedNotice,
  Button,
  Card,
  Meter,
  SectionHeading,
} from "@/components/ui";
import { Sparkline, compact } from "@/components/charts";
import { HeroBand, MiniChip } from "@/components/hero";
import { JourneyStrip, type JourneyStep } from "@/components/journey-strip";
import { ProgressRing } from "@/components/progress-ring";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { CHECKLIST_SECTION } from "@/lib/profile-sections";
import {
  DELIVERABLE_COPY,
  athlete,
  athleteMinor,
  athleteCareer,
  athleteEarningsTrend,
  deliverables,
  earnings,
  invitations,
  money,
  profileChecklist,
  socials,
  type DeliverableState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Athlete Portal — §9 screen 6, requirements §24. Redesigned 2026-09-15
   (spec: docs/superpowers/specs/2026-09-15-athlete-dashboard-redesign-design.md).

   The A2 layout showed everything at equal weight — hero, four tiles, five
   sections, five rail cards — and first-time athletes faced a wall. This
   build stages the page around two focal points: a slim money strip (what is
   my career worth) and one actionable queue (what do I do now), with a
   dismissible journey strip teaching the invite → accept → deliver → get-paid
   loop between them. Everything demoted lives on subpages that already
   exist: per-state earnings on /athlete/earnings, rate card / agreements /
   socials in the profile editor's §11 sections.

   Still fixtures (src/lib/fixtures.ts), still provenance-tagged (§22) — one
   chip on the career figure, one on the audience card. Acceptance stays
   unwired (guide §08): the queue's invite action is "Review terms", a link,
   so nothing on this page is a dead button.
   -------------------------------------------------------------------------- */

const DELIVERABLE_TONE: Record<
  DeliverableState,
  "neutral" | "primary" | "accent" | "warn"
> = {
  NOT_STARTED: "neutral",
  DRAFT_SUBMITTED: "primary",
  BTG_REVIEW: "warn",
  SPONSOR_REVIEW: "warn",
  APPROVED: "accent",
  PUBLISHED: "accent",
  VERIFIED: "accent",
};

/** Sort key for fixture due dates like "May 9" — month-name + day. */
const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const dueKey = (s: string) => {
  const [mon, day] = s.split(" ");
  const m = MONTHS[mon?.slice(0, 3)];
  return m ? m * 100 + Number(day ?? 0) : Number.MAX_SAFE_INTEGER;
};

/** Sort key for fixture expiry strings — "9 hours" < "2 days"; "—" and
 *  "expired …" sort last (those states never reach the open-invite queue). */
const expiryKey = (s: string) => {
  const m = s.match(/^(\d+)\s+(hour|day)/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = Number(m[1]);
  return m[2] === "hour" ? n : n * 24;
};
/** Urgent = expiring within 3 days; drives the warn pill. */
const expiresSoon = (s: string) => expiryKey(s) <= 72;

/* ------------------------------------------------------------- queue icon */
function QueueIcon({ kind }: { kind: "invite" | "deliverable" | "profile" }) {
  const paths = {
    invite: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />,
    deliverable: (
      <>
        <path d="m22 8-6 4 6 4V8Z" />
        <rect x="2" y="6" width="14" height="12" rx="2" />
      </>
    ),
    profile: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />,
  } as const;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-athlete/10 text-athlete">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        {paths[kind]}
      </svg>
    </span>
  );
}

/* ------------------------------------------- slim clickable stat tile */
function SlimTile({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="p-3.5 transition-colors group-hover:bg-surface-2/70">
        <p className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
          <span className="truncate">{label}</span>
          <span
            aria-hidden="true"
            className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
          >
            →
          </span>
        </p>
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-lg font-semibold tabular-nums tracking-tight">
            {value}
          </span>
          {sub && (
            <span className="truncate text-[11px] text-faint">{sub}</span>
          )}
        </p>
      </Card>
    </Link>
  );
}

export default async function AthletePortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  /* §4 — ?demo=minor renders the same athlete as a minor whose guardian is
     still unverified; every action that creates an obligation gates on it. */
  const a = demo === "minor" ? athleteMinor : athlete;
  const guardianPending = a.isMinor && !a.guardian?.verifiedAt;

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {a.firstName}&rsquo;s dashboard
        </h1>
        <p className="mt-1 text-xs text-muted">
          {a.sport} · {a.position} · {a.region} · {a.school}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone="accent">{a.tier} tier</Badge>
        <Badge tone="neutral">{a.tierMultiplier} multiplier</Badge>
      </div>
    </div>
  );

  /* Brand-new athlete: no invites, no earnings — the screen is the next step,
     not a wall of zeros dressed up as progress. */
  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="Your story starts here"
          hint="Stats fill in as you accept invitations and deliver."
          action={{ label: "See invitations", href: "/athlete/invitations" }}
        />
      </div>
    );
  }

  const openInvites = [...invitations]
    .filter((i) => i.state === "INVITED" || i.state === "VIEWED")
    .sort((x, y) => expiryKey(x.expiresIn) - expiryKey(y.expiresIn));
  const due = [...deliverables]
    .filter((d) => d.state === "NOT_STARTED")
    .sort((x, y) => dueKey(x.dueDate) - dueKey(y.dueDate));
  const inReview = deliverables.filter(
    (d) => d.state !== "NOT_STARTED" && d.state !== "VERIFIED",
  );
  const activeCampaigns = new Set(
    deliverables.filter((d) => d.state !== "VERIFIED").map((d) => d.campaign),
  ).size;
  const pending = earnings.find((e) => e.state === "PENDING")!;
  const outstanding = profileChecklist.filter((c) => !c.done);
  const attentionCount =
    openInvites.length + due.length + (outstanding.length > 0 ? 1 : 0);

  // Momentum: monthly earnings trend average (Σ Earning by month — Postgres).
  const trendAvgCents = Math.round(
    athleteEarningsTrend.reduce((s, v) => s + v, 0) /
      athleteEarningsTrend.length,
  );

  /* The journey strip's counts come from the same derivations as the queue,
     so the teaching element never disagrees with the work list. */
  const journeySteps: JourneyStep[] = [
    {
      label: "Get invited",
      sub: `${openInvites.length} waiting`,
      href: "/athlete/invitations",
    },
    { label: "Accept the deal", sub: `${activeCampaigns} active` },
    { label: "Deliver & verify", sub: `${due.length} due`, href: "#queue" },
    {
      label: "Get paid",
      sub: `${money(pending.amount)} pending`,
      href: "/athlete/earnings",
    },
  ];
  const journeyCurrent =
    due.length > 0 ? 2 : openInvites.length > 0 ? 0 : 3;

  return (
    <div className="space-y-6">
      {guardianPending && (
        <BlockedNotice>
          Guardian authorization pending — {a.guardian?.legalName} must be
          verified before {a.firstName} can accept an invitation or submit a
          deliverable (§4). Invitations stay open; nothing is lost while
          verification completes.
        </BlockedNotice>
      )}

      {/* -------------------------------------------------------- headline */}
      {heading}

      {/* ----------------------------------------------------- money strip */}
      <HeroBand border="border-athlete/30" className="sx-animate">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ProgressRing pct={athleteCareer.payoutRingPct}>
            <div>
              <p className="text-lg font-bold tabular-nums leading-none">
                {athleteCareer.payoutRingPct}%
              </p>
              <p className="mt-0.5 text-[9px] uppercase tracking-wide text-muted">
                to payout
              </p>
            </div>
          </ProgressRing>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              {a.firstName} — your NIL career
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-primary),var(--sx-accent))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
                {money(athleteCareer.careerEarningsCents)} earned
              </span>
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
            <p className="mt-1.5 text-xs text-muted">
              <span className="font-semibold text-text">
                {money(athleteCareer.approvedCents)}
              </span>{" "}
              approved → payout {athleteCareer.nextPayout} · on-time{" "}
              {athleteCareer.onTimeRatePct}%
            </p>
          </div>
        </div>
      </HeroBand>

      {/* -------------------------------- journey strip (teaching element) */}
      <JourneyStrip steps={journeySteps} current={journeyCurrent} />

      {/* --------------------------------------------- slim stat tile row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SlimTile
          label="Open invitations"
          value={String(openInvites.length)}
          sub="awaiting your response"
          href="/athlete/invitations"
        />
        <SlimTile
          label="Deliverables due"
          value={String(due.length)}
          sub={`next: ${due[0]?.dueDate ?? "—"}`}
          href="#queue"
        />
        <SlimTile
          label="Pending earnings"
          value={money(pending.amount)}
          sub={`${pending.count} orders in cycle`}
          href="/athlete/earnings"
        />
        <Link href="/athlete/earnings" className="group block">
          <Card className="p-3.5 transition-colors group-hover:bg-surface-2/70">
            <p className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
              Momentum
              <span
                aria-hidden="true"
                className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100"
              >
                →
              </span>
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Sparkline
                  points={athleteEarningsTrend}
                  stroke="var(--sx-athlete)"
                />
              </div>
              <span className="shrink-0 text-[11px] text-faint">
                <span className="font-semibold text-text">
                  {money(trendAvgCents)}
                </span>
                /mo avg
              </span>
            </div>
          </Card>
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ============================================== action queue */}
        <section id="queue" className="sx-animate sx-delay-1 min-w-0">
          <SectionHeading
            title={`Needs your attention · ${attentionCount}`}
            hint="Everything waiting on you, most urgent first"
          />
          <Card className="p-0">
            <ul className="divide-y divide-line-soft">
              {/* -------- open invitations, soonest expiry first -------- */}
              {openInvites.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                >
                  <QueueIcon kind="invite" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-tight">
                      {inv.sponsor} — {inv.campaign} ·{" "}
                      <span className="tabular-nums">{money(inv.offered)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-faint">
                      {inv.deliverableCount}{" "}
                      {inv.deliverableCount === 1
                        ? "deliverable"
                        : "deliverables"}{" "}
                      · usage {inv.usageRights} ·{" "}
                      {inv.exclusivity ?? "no exclusivity"}
                    </p>
                  </div>
                  {inv.state === "INVITED" && <Badge tone="primary">New</Badge>}
                  <Badge tone={expiresSoon(inv.expiresIn) ? "warn" : "neutral"}>
                    expires in {inv.expiresIn}
                  </Badge>
                  <Button
                    variant="secondary"
                    href={`/athlete/orders/${inv.id}?from=athlete-portal`}
                  >
                    Review terms
                  </Button>
                </li>
              ))}

              {/* --------- due deliverables, soonest due first ---------- */}
              {due.map((d, i) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
                >
                  <QueueIcon kind="deliverable" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-tight">
                      {d.title}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-faint">
                      {d.campaign} · {d.sponsor}
                    </p>
                  </div>
                  <Badge tone={i === 0 ? "warn" : "neutral"}>
                    due {d.dueDate}
                  </Badge>
                  <Button
                    variant="secondary"
                    disabled={guardianPending}
                    title={
                      guardianPending
                        ? "Blocked: a minor needs a verified guardian first (§4)"
                        : "Opens the direct-to-R2 presigned upload (guide §11) — not wired"
                    }
                  >
                    Upload proof
                  </Button>
                </li>
              ))}

              {/* ------------- profile gaps, one collapsed row ---------- */}
              {outstanding.length > 0 && (
                <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <QueueIcon kind="profile" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold tracking-tight">
                      Finish your profile — {outstanding.length}{" "}
                      {outstanding.length === 1 ? "item" : "items"} left
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-faint">
                      {outstanding.map((o) => o.label).join(" · ")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    href={`/athlete/profile/edit?section=${
                      CHECKLIST_SECTION[outstanding[0].label] ?? "identity"
                    }`}
                  >
                    Finish →
                  </Button>
                </li>
              )}
            </ul>

            {/* --------------- waiting-on-others footer + quiet list ------ */}
            {inReview.length > 0 && (
              <>
                <div className="border-t border-dashed border-line-soft px-4 py-2.5 text-[11px] text-faint">
                  In review, nothing to do:{" "}
                  <span className="font-medium text-muted">
                    {inReview.length}{" "}
                    {inReview.length === 1 ? "deliverable" : "deliverables"}
                  </span>{" "}
                  with BTG / sponsor ·{" "}
                  <a href="#in-review" className="text-accent hover:underline">
                    see all →
                  </a>
                </div>
                <ul
                  id="in-review"
                  className="divide-y divide-line-soft border-t border-line-soft bg-surface-2/30"
                >
                  {inReview.map((d) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2"
                    >
                      <span className="w-12 shrink-0 text-[11px] text-faint">
                        {d.dueDate}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] text-muted">
                          {d.title}
                        </p>
                        <p className="truncate text-[10px] text-faint">
                          {d.campaign} · {d.sponsor}
                        </p>
                      </div>
                      <Badge tone={DELIVERABLE_TONE[d.state]}>
                        {DELIVERABLE_COPY[d.state]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </section>

        {/* ==================================================== rail */}
        <div className="space-y-6">
          <section className="sx-animate sx-delay-2">
            <SectionHeading title="Earnings" />
            <Card>
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">
                  {money(pending.amount)}
                </span>
                <span className="text-[11px] text-faint">
                  pending this cycle
                </span>
              </p>
              <p className="mt-1.5 text-[11px] text-muted">
                {money(athleteCareer.approvedCents)} approved → payout{" "}
                {athleteCareer.nextPayout}
              </p>
              <div className="mt-3">
                <Button variant="secondary" href="/athlete/earnings" full>
                  Earnings detail
                </Button>
              </div>
            </Card>
          </section>

          <section className="sx-animate sx-delay-3">
            <SectionHeading title="Profile" />
            <Card>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-semibold tabular-nums">
                  {a.profileCompletion}%
                </span>
                <span className="text-[11px] text-muted">
                  {profileChecklist.filter((c) => c.done).length}/
                  {profileChecklist.length} sections
                </span>
              </div>
              <div className="mt-2">
                <Meter value={a.profileCompletion} tone="accent" />
              </div>
              <div className="mt-3">
                <Button variant="secondary" href="/athlete/profile/edit" full>
                  {outstanding.length > 0 ? "Finish profile" : "Edit profile"}
                </Button>
              </div>
            </Card>
          </section>

          <section className="sx-animate sx-delay-4">
            <SectionHeading title="Audience" />
            <Card>
              <p className="flex flex-wrap items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight">
                  {compact(athleteCareer.followers)}
                </span>
                <span className="text-[11px] text-faint">
                  followers · {athleteCareer.engagementRatePct}% engagement
                </span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[11px] text-muted">
                  {socials
                    .map((s) => `${s.platform} ${compact(s.followers)}`)
                    .join(" · ")}
                </span>
                <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
              </p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  href="/athlete/profile/edit?section=socials"
                  full
                >
                  Manage socials
                </Button>
              </div>
            </Card>
          </section>

          {a.isMinor && (
            <section className="sx-animate sx-delay-5">
              <SectionHeading title="Guardian" hint="§4 · §11" />
              <Card>
                <p className="text-xs">{a.guardian?.legalName}</p>
                <div className="mt-2">
                  {a.guardian?.verifiedAt ? (
                    <Badge tone="accent">Verified</Badge>
                  ) : (
                    <Badge tone="warn">Verification pending</Badge>
                  )}
                </div>
              </Card>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
```

**Prop-compatibility notes for the engineer (verify before assuming):**
- `Button` is used with `href`, `variant`, `full`, `disabled`, `title` — all of these appear in the *current* page.tsx and rail sections, so they exist. If `Button` lacks `variant="ghost"` + `href` together, check its signature in `src/components/ui.tsx` and fall back to a `Link` styled like the old "Full terms →" link.
- `Badge` tones used: `accent`, `neutral`, `primary`, `warn` — all in current use.
- `compact()` from `@/components/charts` is used on follower counts in the current page.
- `MiniChip` kinds `ver` and `manual` are both in current use.
- If `rates`/`agreements`/`SourceLabel`/`StatTile` imports linger, remove them — the linter will flag unused imports.

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint` then `npx tsc --noEmit`
Expected: both clean. Most likely failures: unused imports (remove them), a `Button` prop mismatch (see notes above), or `athleteMinor` lacking a field the page reads (mirror how the old page read it — all reads here are copied from the old page).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/athlete/page.tsx"
git commit -m "feat(athlete): staged dashboard — money strip, journey strip, action queue + rail (spec 2026-09-15)"
```

---

### Task 3: Demo-state walkthrough

**Files:** none (verification; fixes go back into the Task 1/2 files if found)

- [ ] **Step 1: Start the dev server** (or use the running one)

Run: `npm run dev` — note the port.

- [ ] **Step 2: Walk every state and check:**

| URL | Checks |
|---|---|
| `/athlete` | Order: notices→heading→hero→journey→tiles→queue+rail. Queue sorted: "9 hours" invite first. Journey shows "Deliver & verify" highlighted with live counts. No rate card / agreements / earnings-list / audience-detail / checklist sections anywhere. |
| `/athlete` (again) | Dismiss journey strip ✕ → reload → strip stays hidden (localStorage). Clear the key in devtools → strip returns. |
| `/athlete?demo=minor` | Guardian BlockedNotice on top, Upload proof disabled with §4 tooltip, Guardian rail card shows "Verification pending". |
| `/athlete?demo=empty` | Unchanged EmptyState, no journey strip, no queue. |
| `/athlete?demo=loading` | SkeletonPage. |
| `/athlete?demo=error` | Error boundary renders. |
| Links | Every tile/rail/queue link resolves: `/athlete/invitations`, `#queue`, `/athlete/earnings`, `/athlete/orders/[id]?from=athlete-portal`, `/athlete/profile/edit`, `?section=socials`, `?section=` deep-link from profile row. `#in-review` anchor scrolls. |
| Widths | Mobile (~390px): tiles 1-col→2-col, queue above rail, journey strip stacks vertically. `xl`: two columns. |

- [ ] **Step 3: Fix anything found, re-verify, commit fixes**

```bash
git add -A src/
git commit -m "fix(athlete): dashboard walkthrough fixes"
```
(Skip the commit if nothing needed fixing.)

---

### Task 4: Team memory log + task board

**Files:**
- Create: `memory/2026-09-15/athlete-dashboard-redesign.md`
- Edit: `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx` (NOT committed — gitignored/never-commit rule)

- [ ] **Step 1: Write the memory log**

```markdown
# Athlete dashboard redesign (learning-curve pass)

**What:** Rebuilt `/athlete` per spec
`docs/superpowers/specs/2026-09-15-athlete-dashboard-redesign-design.md`.
Two focal points: slim money strip, then one actionable "Needs your
attention" queue (expiring invites → due deliverables → profile row) beside
a 3-card rail (earnings / profile / audience). New teaching element:
`src/components/journey-strip.tsx` — dismissible 4-step journey strip
(localStorage `sx-athlete-journey-dismissed`), the page's only new client
island.

**Removed from the dashboard (rehoused, not lost):** per-state earnings →
`/athlete/earnings`; rate card → profile editor `?section=rates`;
agreements → `?section=agreements`; audience detail → `?section=socials`;
full checklist → editor; amber onboarding strip → queue profile row; §08
acceptance notice → order page (dashboard has no accept button anymore —
its invite action is "Review terms", a link).

**Kept:** all `?demo=` states, §4 minor gating (upload disabled + guardian
rail card), §22 provenance chips (hero figure + audience card), slim
clickable stat tiles (user chose to keep them).

**Why:** first-time athletes faced a wall — everything at equal weight.
User picked "both, staged" (money then actions) from three layouts.
```

- [ ] **Step 2: Commit the memory log**

```bash
git add memory/2026-09-15/athlete-dashboard-redesign.md
git commit -m "docs(memory): 2026-09-15 athlete dashboard redesign log"
```

- [ ] **Step 3: Update the task board xlsx**

The live tracker is `Claude outputs/SponsorX-Full-Programme-Task-Board.xlsx`
(NOT `documentation/` — that path is stale). Per CLAUDE.md: build a throwaway
venv with `openpyxl` in the session scratchpad, back the workbook up there
first. Look for an existing P1-FE task covering the athlete portal dashboard
rework; if none matches, **add a row** (fractional `Order`, e.g. between its
P1-FE neighbours) — task raised as "P1-FE: athlete dashboard learning-curve
redesign", Status `Done`, Owner + Date Started + Date Done = 2026-09-15.
Extend the autofilter / conditional formatting / status validation / Dashboard
COUNT formulas if a row was inserted (they hardcode the last row — 190 as of
2026-09-12; verify current). Do NOT commit the xlsx. Remind the user the
Google Sheet mirror is their end-of-day manual step.

---

## Self-review (done at write time)

- **Spec coverage:** staging §1–6 → Task 2 (notices/heading/hero/journey/tiles/columns); queue rows + footer + `#in-review` → Task 2; rail cards + guardian → Task 2; journey island + localStorage → Task 1; rehousing = links only (verified: `?section=rates|agreements|socials` exist in `SECTIONS`, `/athlete/earnings` carries the breakdown); demo states → Task 2 code + Task 3 walkthrough; verification section → Task 3. No gaps.
- **Placeholders:** none — every code step is complete code.
- **Type consistency:** `JourneyStep` defined in Task 1, imported in Task 2 with matching shape (`label`/`sub`/`href?`); fixture field reads all copied from the current page.tsx or verified in fixtures.ts (`expiresIn` strings, `athleteCareer.followers/engagementRatePct/nextPayout`, `socials[].platform/followers`).
