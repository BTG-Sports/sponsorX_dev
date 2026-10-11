import type { CSSProperties } from "react";

import { ArenaChip, ArenaHead, ArenaPanel, ArenaSection, ArenaTile, ArenaTiles, at, type ArenaTone } from "@/components/arena-stage";
import { AreaChart } from "@/components/charts";
import { MiniChip } from "@/components/hero";
import { ActivityExplorer, ServerActivityExplorer } from "@/components/activity-explorer";
import { ExportReport } from "@/components/export-report";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { buildAthleteEarningsReport } from "@/lib/earnings-report-data";
import { JOURNEY, when } from "@/lib/earnings-ui";
import {
  STATES,
  activityExtras,
  pagedQuery,
  summaryBuckets,
  toActivityItem,
  type ApiEarning,
  type ApiEarningsSummary,
  type ApiPage,
} from "@/lib/earnings-live";
import type { EarningState } from "@/lib/fixtures";
import { pageParams, type SearchParams } from "@/lib/list-query";
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

   SERVER-PAGED (2026-09-29). Live, nothing is fetched whole and totalled in
   the browser: the hero, the journey and the trend come from
   GET /earnings/summary (aggregated in Postgres over the athlete's whole
   scope), and Recent activity is one page of GET /earnings?page= with the
   explorer's search / status / type / date filters applied in the query.

   P1-ART-22 (2026-10-11) — redrawn on the Arena (components/arena-stage.tsx)
   as a dashboard, the hero gone: a small title with the provenance pill and
   one lede, then the money journey as KPI plates — career (when the summary
   carries it; the fixture's canonical total in demo mode), in review,
   cleared, payout approved, paid — in cents with `format="usd"`, each from
   the summary's byState. The paid-by-month AreaChart stays (real data) on a
   plate beside the "on the way" and verified-deliverables lines; the held
   strip is a danger plate; Recent activity and the trust bar are unchanged
   in substance. The reads, the demo/fixture branches and the export are as
   they were.
   -------------------------------------------------------------------------- */

type LiveEarnings = { summary: ApiEarningsSummary; rows: ApiEarning[]; page: ApiPage; year: number };

async function liveEarnings(sp: SearchParams): Promise<LiveEarnings | null> {
  /* No catch — an outage is an error page, never fixtures dressed as the
     athlete's own money (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => r === "ATHLETE" || r === "GUARDIAN")) return null;
  const year = new Date().getUTCFullYear();
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const extras = activityExtras(
    { q: one(sp.q), status: one(sp.status), type: one(sp.type), from: one(sp.from), to: one(sp.to) },
    year,
  );
  const [sumRes, listRes] = await Promise.all([
    apiFetch(`/earnings/summary?year=${year}`),
    apiFetch(`/earnings${pagedQuery(pageParams(sp), extras)}`),
  ]);
  if (!sumRes.ok) throw new Error(`Earnings unavailable (${sumRes.status}).`);
  if (!listRes.ok) throw new Error(`Earnings unavailable (${listRes.status}).`);
  const summary = (await sumRes.json()) as ApiEarningsSummary;
  const list = (await listRes.json()) as { earnings: ApiEarning[]; page: ApiPage };
  return { summary, rows: list.earnings, page: list.page, year };
}

/** Axis ticks in dollars ($2.8K), not the raw-cents "283K" `compact` gives. */
const fmtUsd = (c: number) => {
  if (c === 0) return "$0";
  const k = c / 100_000;
  return `$${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}K`;
};

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const TITLE = "Earnings";
const LEDE = "Every dollar from delivered work to payout — reviewed, cleared, approved, paid.";

/** Each journey plate's tone once it holds money; empty plates stay ink. */
const STAGE_TONE: Partial<Record<EarningState, ArenaTone>> = {
  PENDING: "ink",
  ELIGIBLE: "blue",
  APPROVED_FOR_PAYOUT: "blue",
  PAID: "win",
};
/** The plate caption's second half — JOURNEY's blurb, short enough for one line. */
const STAGE_SHORT: Partial<Record<EarningState, string>> = {
  PENDING: "proof being checked",
  ELIGIBLE: "queued for finance",
  APPROVED_FOR_PAYOUT: "next payout run",
  PAID: "already sent your way",
};

export default async function AthleteEarningsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const live = demo === null ? await liveEarnings(sp) : null;
  const now = new Date();
  const readAt = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const pill = live ? `Postgres · read ${readAt}` : "Sample statement";

  if (demo === "empty" || (live && live.summary.count === 0)) {
    return (
      <div className="space-y-6">
        <ArenaHead title={TITLE} pill={pill} lede={LEDE} />
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
  // Fixture mode sorts the sample client-side; live rows arrive one page at
  // a time, already filtered and sorted by the API.
  const mine = live
    ? live.rows.map(toActivityItem)
    : earningItems
        .filter((e) => e.athlete === athlete.displayName)
        .sort((a, b) => when(b.updatedAt) - when(a.updatedAt));
  /* Career: the summary's own figure when it carries one; the fixture's
     canonical total in demo mode; otherwise no plate — nothing is invented. */
  const liveCareer = live ? (live.summary.career ?? null) : null;
  const career = live
    ? liveCareer && { cents: liveCareer.raised, caption: `${money(liveCareer.paid)} already paid` }
    : { cents: athleteCareer.careerEarningsCents, caption: "across campaigns, to date" };
  const onTheWay = live ? (liveCareer?.onTheWay ?? null) : athleteCareer.approvedCents;
  const liveBuckets = live ? summaryBuckets(live.summary) : null;
  const year = live?.year ?? now.getUTCFullYear();
  const verifiedDeliverables = live?.summary.deliverables.verified ?? 0;
  const totalDeliverables = live?.summary.deliverables.total ?? 0;

  // Seed the explorer's filters from the URL so filtered links stay
  // shareable; the island clamps stale values and keeps the URL in sync.
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  const byState: Record<string, { amount: number; count: number } | undefined> = liveBuckets
    ? liveBuckets
    : Object.fromEntries(earnings.map((e) => [e.state, e]));
  const held = byState.HELD && byState.HELD.count > 0 ? byState.HELD : undefined;

  // Monthly earnings trend (Σ Earning by month — Postgres). Live: payouts
  // by the month they were PAID, this year, through this month.
  const series = live
    ? (live.summary.paidByMonth?.months ?? Array.from({ length: 12 }, () => 0)).slice(0, now.getUTCMonth() + 1)
    : athleteEarningsTrend;
  const trendPoints = series.map((a, i) => ({
    label: MONTH_LABELS[i] ?? "",
    a,
  }));
  const trendAvgCents = Math.round(series.reduce((s, v) => s + v, 0) / Math.max(1, series.length));
  const orders = (n: number) => `${n} ${n === 1 ? "order" : "orders"}`;

  return (
    <div className="space-y-8">
      {/* -------------------------------------------------------- headline */}
      <ArenaHead
        title={TITLE}
        pill={pill}
        lede={LEDE}
        actions={
          /* Client-side export of the athlete's own statement — same model
             the page draws; §19's render worker takes over generation later. */
          !live ? (
            <ExportReport
              payload={{
                kind: "athlete-earnings",
                report: buildAthleteEarningsReport(),
              }}
            />
          ) : undefined
        }
      >
        {/* The money journey as KPI plates: career, then the four §21 stages
            left to right. Cents in, dollars out; every figure is the summary's. */}
        <ArenaTiles cols={career ? 5 : 4}>
          {career && (
            <ArenaTile
              label="Career"
              value={career.cents}
              format="usd"
              caption={career.caption}
              tone={career.cents ? "win" : "ink"}
              delay={0.1}
            />
          )}
          {JOURNEY.map((stage, i) => {
            const bucket = byState[stage.state];
            const amount = bucket?.amount ?? 0;
            const count = bucket?.count ?? 0;
            return (
              <ArenaTile
                key={stage.state}
                label={stage.title}
                value={amount}
                format="usd"
                caption={`${orders(count)} · ${STAGE_SHORT[stage.state] ?? stage.blurb}`}
                tone={count ? (STAGE_TONE[stage.state] ?? "blue") : "ink"}
                delay={0.16 + i * 0.06}
              />
            );
          })}
        </ArenaTiles>
      </ArenaHead>

      {/* ------------------------------------------------------- the trend */}
      <section>
        <ArenaSection
          title={live ? `Paid by month · ${year}` : "Monthly earnings · 2026"}
          hint={live ? "What landed with you, by the month it was paid." : "Everything you’ve earned across campaigns, by month."}
          delay={0.42}
        />
        <ArenaPanel delay={0.46} spot>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-center">
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
                  <strong className="sx-arena-num font-semibold text-text">
                    {money(trendAvgCents)}
                  </strong>
                  /month
                </span>
                <MiniChip kind="ver">POSTGRES</MiniChip>
              </div>
            </div>

            {/* What's arriving next, and the work behind it. */}
            <div className="space-y-3 text-xs text-muted lg:border-l lg:border-line-soft lg:pl-6">
              {onTheWay !== null && (
                <p className="flex items-start gap-2">
                  <span className="relative mt-1 inline-flex size-2 shrink-0" aria-hidden="true">
                    <span className="sx-viz-pulse absolute inset-0 rounded-full bg-success" />
                    <span className="relative inline-flex size-2 rounded-full bg-success" />
                  </span>
                  <span>
                    <strong className="sx-arena-num text-sm text-text">{money(onTheWay)}</strong>{" "}
                    {live ? "approved and on the way with BTG’s next payout run" : `on the way — payout ${athleteCareer.nextPayout}`}
                  </span>
                </p>
              )}
              <p className="flex items-start gap-2">
                <span className="mt-1 inline-flex size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <span>
                  {live ? (
                    <>
                      <strong className="sx-arena-num text-sm text-text">
                        {verifiedDeliverables} of {totalDeliverables}
                      </strong>{" "}
                      deliverables verified across your orders
                    </>
                  ) : (
                    <>
                      <strong className="sx-arena-num text-sm text-text">{athleteCareer.onTimeRatePct}%</strong>{" "}
                      on-time delivery — sponsors notice
                    </>
                  )}
                </span>
              </p>
              <p className="text-[11px] leading-relaxed text-faint">
                {/* P7-QA-02: live buckets() spans every earning ever, not a cycle. */}
                {live
                  ? "The plates above cover all your orders, by where each one is now."
                  : "The plates above are this cycle, not your career total."}
              </p>
            </div>
          </div>
        </ArenaPanel>
      </section>

      {/* ------------------------------------------------------- held money */}
      {held && (
        <ArenaPanel tone="danger" delay={0.52} spot>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <ArenaChip tone="danger">On hold</ArenaChip>
            <span className="sx-arena-num text-sm text-text">{money(held.amount)}</span>
            <span className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
              {live
                ? `${held.count === 1 ? "One earning is" : `${held.count} earnings are`} on hold while BTG Finance checks the work behind ${held.count === 1 ? "it" : "them"} — nothing is lost; it moves again once cleared.`
                : heldNote.replace(" (§21)", "")}
            </span>
          </div>
        </ArenaPanel>
      )}

      {/* ------------------------------------------------------ recent orders */}
      <section id="activity">
        <ArenaSection
          title="Recent activity"
          hint={
            live
              ? "Every earning, most recent first — search or filter, click one for the full story."
              : "Search or filter your orders — click one for the full story. A sample of the cycle, not the career total."
          }
          delay={0.56}
        />
        <div className="sx-arena-in" style={at(0.6)}>
          {live ? (
            <ServerActivityExplorer
              items={mine}
              page={live.page}
              year={year}
              statusOptions={STATES.filter((s) => live.summary.byState[s]?.count)}
              typeOptions={live.summary.jobNames}
              initial={{
                q: one(sp.q),
                from: one(sp.from),
                to: one(sp.to),
                status: one(sp.status),
                type: one(sp.type),
              }}
            />
          ) : (
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
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------- trust bar */}
      <div
        className="sx-arena-plate sx-arena-in flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 pl-7"
        style={at(0.66, { "--tone": "var(--sx-line)" } as CSSProperties)}
      >
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
