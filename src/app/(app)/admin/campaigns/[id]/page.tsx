import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Badge, BlockedNotice, Card, Meter, SectionHeading } from "@/components/ui";
import {
  AreaChart,
  ChartLegend,
  HBarList,
  RadialGauge,
  Sparkline,
  compact,
} from "@/components/charts";
import { HeroBand, MiniChip, Monogram, initials } from "@/components/hero";
import { RosterOps } from "@/components/roster-ops";
import { EmptyState, SkeletonPage } from "@/components/states";
import { resolveBack } from "@/lib/back";
import { PACE_COPY, fmtRate, paceFor, paceProjection } from "@/lib/campaign-ui";
import { demoState } from "@/lib/demo";
import { campaignDetailX } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Campaign Operations Dashboard — §9 screen 9, mockup screen 9.
   Redesigned 2026-09-14 (UX feedback: the old page was stat cards over a
   static table, with a fake tab strip of "Not built yet" spans).

   The page now answers the operator's two questions in order. "Is this
   campaign healthy?" is the hero band — percent-to-target as a gauge, the
   recent daily rate vs the rate still needed, and where the campaign lands
   if the rate holds (also drawn as the chart's dashed projection tail).
   "Who needs my attention?" is the RosterOps client island — §9.9's
   per-athlete acceptance, Campaign Orders, delivery and issue flags as an
   interactive roster: filter pills, instant search, a delivery ring per row,
   and a slide-over drawer that spells out the order lifecycle and offers the
   one action each state calls for.
   -------------------------------------------------------------------------- */

const PACE_DOT: Record<string, string> = {
  accent: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
};

export default async function CampaignDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const { id } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";
  const back = resolveBack(one(sp.from) || undefined, "admin");

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        <BackLink target={back} />
        <EmptyState
          mark="chart"
          title="No tracking data yet"
          hint="Metrics fill in as deliverables publish."
        />
      </div>
    );
  }

  const d =
    campaignDetailX[id as keyof typeof campaignDetailX] ?? campaignDetailX.c1;
  const c = d.campaign;
  const pace = paceFor(c, d.series);
  const paceCopy = PACE_COPY[pace.band];
  const projection = paceProjection(c, pace.recentPerDay);
  const lands = pace.projectedTotal >= c.viewsTarget;
  const flagged = d.roster.filter((r) => r.flag).length;
  const engagementDelta = (() => {
    const last = d.series[d.series.length - 1]?.b ?? 0;
    const prev = d.series[d.series.length - 2]?.b ?? 0;
    return prev > 0 ? ((last - prev) / prev) * 100 : 0;
  })();

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      {/* --------------------------------------------------------- header */}
      <div className="sx-animate flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Monogram
            text={initials(c.presentedBy)}
            tone="primary"
            className="size-11 text-xs"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{c.name}</h1>
              <Badge tone="accent">Active</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Presented by {c.presentedBy} · {c.daysRemaining} days remaining
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/campaigns/new?from=campaign"
            className="rounded-lg border border-line px-3.5 py-2 text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
          >
            Edit campaign
          </Link>
          <Link
            href={`/sponsor/campaigns/${id}/report?from=campaign`}
            className="rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
          >
            Sponsor report
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------- hero band */}
      <HeroBand border="border-admin/25" className="sx-animate sx-delay-1">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_11rem] lg:items-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Delivery pacing
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
                {pace.pct}%
              </span>
              <span className="text-sm text-muted">
                of the views target delivered
              </span>
              <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
            </p>

            <div className="mt-4 space-y-2.5 text-xs text-muted">
              <p className="flex items-start gap-2">
                <span
                  className="relative mt-1 inline-flex size-2 shrink-0"
                  aria-hidden="true"
                >
                  {paceCopy.tone !== "accent" && (
                    <span
                      className={`sx-viz-pulse absolute inset-0 rounded-full ${PACE_DOT[paceCopy.tone]}`}
                    />
                  )}
                  <span
                    className={`relative inline-flex size-2 rounded-full ${PACE_DOT[paceCopy.tone]}`}
                  />
                </span>
                <span>
                  <strong className="font-semibold text-text">
                    {paceCopy.label}
                  </strong>{" "}
                  — publishing ~{fmtRate(pace.recentPerDay)} views a day over
                  the last two weeks; {fmtRate(pace.neededPerDay)} a day hits
                  the target with {c.daysRemaining} days left.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <span
                  className={`mt-1 inline-flex size-2 shrink-0 rounded-full ${lands ? "bg-success" : "bg-warn"}`}
                  aria-hidden="true"
                />
                <span>
                  At this rate the campaign lands near{" "}
                  <strong className="font-semibold text-text">
                    {compact(pace.projectedTotal)} views
                  </strong>{" "}
                  — {lands ? "above" : "below"} the {compact(c.viewsTarget)}{" "}
                  target.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <span
                  className={`mt-1 inline-flex size-2 shrink-0 rounded-full ${flagged > 0 ? "bg-danger" : "bg-success"}`}
                  aria-hidden="true"
                />
                <span>
                  {flagged > 0 ? (
                    <>
                      <strong className="font-semibold text-text">
                        {flagged} of {d.roster.length}
                      </strong>{" "}
                      athletes need attention — handled in the roster below
                    </>
                  ) : (
                    "Roster healthy — every order accepted and on schedule"
                  )}
                </span>
              </p>
            </div>
          </div>

          <div className="justify-self-center">
            <RadialGauge
              display={`${pace.pct}%`}
              sweep={pace.pct / 100}
              caption="views target"
              sub={`${compact(c.viewsDelivered)} of ${compact(c.viewsTarget)} views`}
            />
          </div>
        </div>
      </HeroBand>

      {d.notice && <BlockedNotice>{d.notice}</BlockedNotice>}

      {/* ----------------------------------------------------- stat tiles */}
      <div className="sx-animate sx-delay-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Views delivered</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.viewsDelivered.toLocaleString()}
          </p>
          <p className="mt-1 text-[10px] text-faint">
            of {c.viewsTarget.toLocaleString()} target ·{" "}
            {pace.remaining.toLocaleString()} to go
          </p>
          <div className="mt-2">
            <Meter value={pace.pct} tone={pace.pct >= 90 ? "accent" : "primary"} />
          </div>
          <div className="mt-2">
            <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Engagements</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {c.engagements.toLocaleString()}
            </span>
            <span
              className={`text-[11px] font-medium tabular-nums ${engagementDelta >= 0 ? "text-accent" : "text-danger"}`}
            >
              {engagementDelta >= 0 ? "+" : ""}
              {engagementDelta.toFixed(1)}%
            </span>
          </div>
          <div className="mt-2">
            <Sparkline points={d.series.map((p) => p.b ?? 0)} />
          </div>
          <div className="mt-2">
            <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Rewards redeemed</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.rewardsRedeemed.toLocaleString()}
          </p>
          <p className="mt-1 text-[10px] text-faint">fan QR redemptions</p>
          <div className="mt-2">
            <MiniChip kind="ver">POSTGRES</MiniChip>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Days remaining</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.daysRemaining}
          </p>
          <p className="mt-1 text-[10px] text-faint">
            needs {fmtRate(pace.neededPerDay)} views a day to hit target
          </p>
          <div className="mt-2">
            <MiniChip kind="est">COMPUTED</MiniChip>
          </div>
        </Card>
      </div>

      {/* ------------------------------------ performance + top content */}
      <div className="sx-animate sx-delay-3 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <SectionHeading
            title="Performance over time"
            hint="Solid lines are verified history; the dashed tail projects the last two weeks' rate forward."
            action={
              <div className="flex flex-wrap items-center gap-4">
                <ChartLegend aName="Views" bName="Engagements" />
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span
                    className="w-3 border-t-2 border-dashed border-primary-soft"
                    aria-hidden="true"
                  />
                  Projected
                </span>
              </div>
            }
          />
          <Card>
            <AreaChart
              points={d.series}
              aName="Views"
              bName="Engagements"
              projection={projection}
            />
          </Card>
        </section>

        <section className="min-w-0">
          <SectionHeading title="Top content" hint="Ranked by verified views" />
          <Card>
            <HBarList
              rows={d.topContent.map((t) => ({
                label: t.title,
                sub: t.athlete,
                value: t.views,
                display: compact(t.views),
              }))}
            />
          </Card>
        </section>
      </div>

      {/* --------------------------------- per-athlete operations (§9.9) */}
      <section className="sx-animate sx-delay-4">
        <SectionHeading
          title="Athlete roster"
          hint="Every Campaign Order on this campaign — click a row for the order's story and the action it needs."
        />
        <RosterOps
          roster={d.roster}
          initial={{ q: one(sp.q), show: one(sp.show) }}
        />
      </section>

      {/* ------------------------------------------------------ trust note */}
      <p className="sx-animate sx-delay-4 text-[10px] leading-relaxed text-faint">
        Campaign <code className="font-mono">{id}</code> · fixture data.
        Under-delivery and awaiting-acceptance flags are raised automatically
        as deliverables track against the order schedule.
      </p>
    </div>
  );
}
