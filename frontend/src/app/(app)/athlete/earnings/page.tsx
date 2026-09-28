import { Card, SectionHeading, Badge } from "@/components/ui";
import { AreaChart } from "@/components/charts";
import { HeroBand, MiniChip } from "@/components/hero";
import { ActivityExplorer } from "@/components/activity-explorer";
import { ExportReport } from "@/components/export-report";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { buildAthleteEarningsReport } from "@/lib/earnings-report-data";
import { JOURNEY, when } from "@/lib/earnings-ui";
import {
  buckets,
  career,
  paidByMonth,
  toActivityItem,
  type ApiEarning,
} from "@/lib/earnings-live";
import { apiFetch, fetchActor } from "@/server/api";
import {
  athlete,
  athleteCareer,
  athleteEarningsTrend,
  earningItems,
  earnings,
  heldNote,
  money,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Athlete Earnings — §24, §21. Redesigned 2026-09-14 (UX feedback: the A2
   layout leaked spec language — "§21 state machine", Σ notation, a card
   *explaining* the state machine — and buried the career total in a tile row).

   The page answers the athlete's four questions in reading order: how much
   have I made (hero), what's arriving next (payout line), where is each
   dollar right now (the money journey), and is anything stuck (hold strip).
   §21 is still the backbone — the journey's four cells ARE
   PENDING → ELIGIBLE → APPROVED_FOR_PAYOUT → PAID, just written in plain
   English (shared copy in src/lib/earnings-ui.ts), with HELD pulled out as
   an attention strip instead of a lecture.

   Recent activity is the page's one client island (ActivityExplorer):
   instant search + date/status/type filters and a slide-over detail drawer.
   A first pass used a no-JS GET form + <details> accordion; feedback was
   that the Apply button and accordion felt clunky, so this screen spends
   the same small client budget as InsightCarousel. Filter state still lives
   in the URL (replaceState) and is seeded back on first render, so filtered
   views stay shareable.

   Constraints unchanged: status only, no money moves through SponsorX in
   Phase 1, no bank details or tax ID anywhere (§26, Addendum A6) — said once,
   in the trust bar. §22 provenance is kept but quiet: one chip on the hero
   figure, one on the trend, one "all figures" chip in the trust bar.
   Canonical career totals come from `athleteCareer` (Postgres); the per-state
   `earnings` buckets and `earningItems` rows are the in-cycle sample and are
   framed as such.

   LIVE vs DEMO (P7-FE-01, the P3-FE-02 precedent). A signed-in athlete (or
   guardian, read only) sees their REAL earnings — GET /earnings, own scope:
   one per accepted Campaign Order, in its §21 state, net of any adjustment.
   Career = what their signed orders are worth (disputed excluded) with the
   paid part stated beside it; the trend is payouts by the month they were
   PAID; activity is every earning. The fixture on-time rate and payout date
   have no source here and are not shown; the PDF/XLSX export is hidden on
   live numbers (its model is fixture-built). Still status only — no bank or
   tax field exists in what the API sends.
   -------------------------------------------------------------------------- */

async function liveEarnings(): Promise<ApiEarning[] | null> {
  /* No catch — an outage is an error page, never fixtures dressed as the
     athlete's own money (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => r === "ATHLETE" || r === "GUARDIAN")) return null;
  const res = await apiFetch("/earnings");
  if (!res.ok) throw new Error(`Earnings unavailable (${res.status}).`);
  return ((await res.json()) as { earnings: ApiEarning[] }).earnings;
}

/** Axis ticks in dollars ($2.8K), not the raw-cents "283K" `compact` gives. */
const fmtUsd = (c: number) => {
  if (c === 0) return "$0";
  const k = c / 100_000;
  return `$${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function AthleteEarningsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Earnings</h1>
      <p className="mt-1 text-xs text-muted">
        Every dollar from delivered work to payout — in one place.
      </p>
    </div>
  );

  const live = demo === null ? await liveEarnings() : null;

  if (demo === "empty" || (live && live.length === 0)) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="clock"
          title="No earnings yet"
          hint="Earnings appear when a campaign order goes live."
        />
      </div>
    );
  }

  // This portal is scoped to the signed-in athlete; fixtures use one demo
  // athlete, so filter earning rows to them (the real query is tenant-scoped).
  const mine = (live ? live.map(toActivityItem) : earningItems.filter((e) => e.athlete === athlete.displayName))
    .sort((a, b) => when(b.updatedAt) - when(a.updatedAt));
  const liveCareer = live ? career(live) : null;
  const liveBuckets = live ? buckets(live) : null;
  const year = new Date().getUTCFullYear();
  const verifiedDeliverables = live
    ? live.reduce((n, e) => n + e.order.deliverables.verified, 0)
    : 0;
  const totalDeliverables = live
    ? live.reduce((n, e) => n + e.order.deliverables.total, 0)
    : 0;

  // Seed the explorer's filters from the URL so filtered links stay
  // shareable; the island clamps stale values and keeps the URL in sync.
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  const byState: Record<string, { amount: number; count: number } | undefined> = liveBuckets
    ? liveBuckets
    : Object.fromEntries(earnings.map((e) => [e.state, e]));
  const held = byState.HELD && byState.HELD.count > 0 ? byState.HELD : undefined;

  // Monthly earnings trend (Σ Earning by month — Postgres). Live: payouts
  // by the month they were PAID, this year, through this month.
  const series = live ? paidByMonth(live, year).slice(0, new Date().getUTCMonth() + 1) : athleteEarningsTrend;
  const trendPoints = series.map((a, i) => ({
    label: MONTH_LABELS[i] ?? "",
    a,
  }));
  const trendAvgCents = Math.round(series.reduce((s, v) => s + v, 0) / Math.max(1, series.length));

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        {/* Client-side export of the athlete's own statement — same model
            the page draws; §19's render worker takes over generation later. */}
        {!live && (
          <ExportReport
            payload={{
              kind: "athlete-earnings",
              report: buildAthleteEarningsReport(),
            }}
          />
        )}
      </div>

      {/* -------------------------------------------------- career hero */}
      <HeroBand border="border-athlete/30" className="sx-animate">
        <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Career earnings
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-primary),var(--sx-accent))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
                {money(liveCareer ? liveCareer.raised : athleteCareer.careerEarningsCents)}
              </span>
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>
            <p className="mt-1 text-[11px] text-faint">
              {liveCareer
                ? `what your signed orders are worth — ${money(liveCareer.paid)} already paid`
                : "everything you’ve earned across campaigns, to date"}
            </p>

            <div className="mt-5 space-y-2.5 text-xs text-muted">
              <p className="flex items-center gap-2">
                <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
                  <span className="sx-viz-pulse absolute inset-0 rounded-full bg-success" />
                  <span className="relative inline-flex size-2 rounded-full bg-success" />
                </span>
                <span>
                  <strong className="font-semibold text-text">
                    {money(liveCareer ? liveCareer.onTheWay : athleteCareer.approvedCents)}
                  </strong>{" "}
                  {liveCareer ? "approved and on the way with BTG’s next payout run" : `on the way — payout ${athleteCareer.nextPayout}`}
                </span>
              </p>
              <p className="flex items-center gap-2">
                <span
                  className="inline-flex size-2 shrink-0 rounded-full bg-primary"
                  aria-hidden="true"
                />
                <span>
                  {liveCareer ? (
                    <>
                      <strong className="font-semibold text-text">
                        {verifiedDeliverables} of {totalDeliverables}
                      </strong>{" "}
                      deliverables verified across your orders
                    </>
                  ) : (
                    <>
                      <strong className="font-semibold text-text">
                        {athleteCareer.onTimeRatePct}%
                      </strong>{" "}
                      on-time delivery — sponsors notice
                    </>
                  )}
                </span>
              </p>
            </div>
          </div>

          <div className="min-w-0">
            <AreaChart
              points={trendPoints}
              aName="Monthly earnings"
              fmtA={fmtUsd}
              xTicks={5}
              height={200}
            />
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-primary" />{" "}
                {live ? `Paid, by month, ${year}` : "Monthly earnings, 2026"}
              </span>
              <span>
                avg{" "}
                <strong className="font-semibold text-text">
                  {money(trendAvgCents)}
                </strong>
                /month
              </span>
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </div>
          </div>
        </div>
      </HeroBand>

      {/* ------------------------------------------------- the money journey */}
      <section className="sx-animate sx-delay-1">
        <SectionHeading
          title="Where your money is"
          hint="Every order moves left to right — reviewed, cleared, approved, paid. This cycle, not your career total."
        />
        <Card className="overflow-hidden p-0">
          <div
            className="h-1 w-full bg-gradient-to-r from-primary/40 via-primary to-accent"
            aria-hidden="true"
          />
          <div className="grid grid-cols-2 gap-px bg-line-soft lg:grid-cols-4">
            {JOURNEY.map((stage, i) => {
              const bucket = byState[stage.state];
              const last = i === JOURNEY.length - 1;
              return (
                <div
                  key={stage.state}
                  className={[
                    "p-4 sm:p-5",
                    `sx-animate sx-delay-${i + 1}`,
                    last
                      ? "bg-gradient-to-br from-accent/12 to-surface"
                      : "bg-surface",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={[
                        "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                        stage.dot,
                      ].join(" ")}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                      {stage.title}
                    </p>
                    {!last && (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="ml-auto hidden size-3 text-faint lg:block"
                        aria-hidden="true"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    )}
                  </div>
                  <p
                    className={[
                      "mt-2.5 text-2xl font-semibold tabular-nums tracking-tight",
                      last ? "text-accent" : "",
                    ].join(" ")}
                  >
                    {money(bucket?.amount ?? 0)}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-faint">
                    {bucket?.count ?? 0}{" "}
                    {(bucket?.count ?? 0) === 1 ? "order" : "orders"}
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted">
                    {live && stage.state === "APPROVED_FOR_PAYOUT"
                      ? "Lands with BTG’s next payout run."
                      : stage.blurb}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>

        {held && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-danger/25 bg-danger/8 px-4 py-3">
            <Badge tone="danger">On hold</Badge>
            <span className="text-xs font-semibold tabular-nums">
              {money(held.amount)}
            </span>
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
              {live
                ? `${held.count === 1 ? "One earning is" : `${held.count} earnings are`} on hold while BTG Finance checks the work behind ${held.count === 1 ? "it" : "them"} — nothing is lost; it moves again once cleared.`
                : heldNote.replace(" (§21)", "")}
            </span>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------ recent orders */}
      <section id="activity" className="sx-animate sx-delay-2">
        <SectionHeading
          title="Recent activity"
          hint={
            live
              ? "Every earning, newest first — search or filter, click one for the full story."
              : "Search or filter your orders — click one for the full story. A sample of the cycle, not the career total."
          }
        />
        <ActivityExplorer
          items={mine}
          demoParam={one(sp.demo) || undefined}
          initial={{
            q: one(sp.q),
            from: one(sp.from),
            to: one(sp.to),
            status: one(sp.status),
            type: one(sp.type),
          }}
        />
      </section>

      {/* ---------------------------------------------------------- trust bar */}
      <div className="sx-animate sx-delay-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-line bg-surface/60 px-4 py-3">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="size-3.5 shrink-0 text-faint"
          aria-hidden="true"
        >
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-muted">
          Your bank account and tax ID never touch SponsorX — BTG Finance
          handles the payout itself, outside the platform.
        </p>
        <span className="flex items-center gap-1.5 text-[10px] text-faint">
          all figures <MiniChip kind="ver">POSTGRES</MiniChip>
        </span>
      </div>
    </div>
  );
}
