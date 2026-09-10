import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Card, SectionHeading } from "@/components/ui";
import {
  AreaChart,
  Donut,
  FunnelSteps,
  HBarList,
  RadialGauge,
} from "@/components/charts";
import { HeroBand, MiniChip, Monogram } from "@/components/hero";
import { compact } from "@/components/line-chart";
import { resolveBack } from "@/lib/back";
import {
  efficiency,
  formatInsight,
  formatPerformance,
  funnelDetail,
  geoInsight,
  geoMarkets,
  money,
  platformSplit,
  roiDelivery,
  roiGauge,
  roiRecommendation,
  roiReport,
  roiTimeline,
  topContentX,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor ROI / Campaign Report — §9 screen 12, redesigned per spec
   2026-09-11: the radial gauge is the centerpiece, the composition bento
   answers "where did results come from", and every figure carries its source
   (§22). Media Value stays estimated and Revenue Attributed stays attributed
   — merchant-validated coupons, not payment-network data (§16).

   "Download PDF" renders THIS layout on the worker via Playwright (B7); the
   bento cells stack into print pages cleanly.
   -------------------------------------------------------------------------- */

export default async function RoiReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const back = resolveBack(from, "sponsor");

  return (
    <div className="space-y-5">
      <BackLink target={back} />

      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Campaign ROI Report
          </h1>
          <p className="mt-1 text-xs text-muted">
            {roiReport.campaign} · Presented by {roiReport.presentedBy} ·{" "}
            {roiReport.period}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            title="Range picker — not wired"
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] font-medium text-muted transition-colors hover:text-text"
          >
            {roiReport.period}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            title="Queues render-report on the worker (Playwright) — not wired"
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-white transition-colors hover:bg-primary-soft"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
              <path d="M12 3v12m0 0-4-4m4 4 4-4M4 19h16" />
            </svg>
            Download PDF
          </button>
        </div>
      </div>

      {/* ------------------------------------------------ zone 1: return */}
      <HeroBand className="sx-animate">
        <div className="grid items-center gap-6 lg:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10">
          <div className="justify-self-center lg:justify-self-start">
            <RadialGauge
              display={roiGauge.value}
              sweep={roiGauge.sweep}
              caption="Return"
              sub="attributed revenue ÷ investment"
              size={150}
            />
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                Invested
              </p>
              <p className="mt-0.5 flex items-baseline gap-2 text-2xl font-semibold tabular-nums tracking-tight">
                {money(roiGauge.invested)}
                <MiniChip kind="manual">ZOHO BOOKS</MiniChip>
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                Revenue attributed
              </p>
              <p className="mt-0.5 flex items-baseline gap-2 text-2xl font-semibold tabular-nums tracking-tight text-accent">
                {money(roiGauge.attributed)}
                <MiniChip kind="att" />
              </p>
              <p className="mt-0.5 text-[10px] text-faint">
                merchant-validated coupon redemptions
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                Est. media value
              </p>
              <p className="mt-0.5 flex items-baseline gap-2 text-base font-medium tabular-nums text-muted">
                {money(roiGauge.mediaValue)}
                <MiniChip kind="est">EST · CURATED CPM</MiniChip>
              </p>
            </div>
          </div>

          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted">
              Return over time
            </p>
            <AreaChart
              points={roiTimeline.series}
              aName="Return"
              fmtA={(n) => `${n.toFixed(1)}×`}
              marker={{
                index: roiTimeline.breakEvenIndex,
                label: roiTimeline.breakEvenLabel,
              }}
              xTicks={3}
              height={180}
            />
          </div>
        </div>
      </HeroBand>

      {/* ------------------------------------------- zone 2: composition */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="sx-animate sx-delay-1">
          <SectionHeading
            title="By content format"
            action={<MiniChip kind="manual">METRICDAILY</MiniChip>}
          />
          <HBarList rows={formatPerformance} />
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10px] leading-relaxed text-faint">
            {formatInsight}
          </p>
        </Card>

        <Card className="sx-animate sx-delay-2">
          <SectionHeading
            title="By platform"
            action={<MiniChip kind="manual">METRICDAILY</MiniChip>}
          />
          <div className="flex items-center gap-4">
            <Donut
              segments={platformSplit.segments}
              centerValue={platformSplit.leaderPct}
              centerLabel={platformSplit.leader}
            />
            <ul className="space-y-1.5">
              {platformSplit.segments.map((s) => (
                <li
                  key={s.label}
                  className="flex items-center gap-1.5 text-[11px] text-muted"
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.label} · {compact(s.value)}
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10px] leading-relaxed text-faint">
            {platformSplit.insight}
          </p>
        </Card>

        <Card className="sx-animate sx-delay-3">
          <SectionHeading
            title="Top markets"
            action={<MiniChip kind="ver">REWARDEVENT · GEO</MiniChip>}
          />
          <HBarList rows={geoMarkets.map((g) => ({ ...g, tone: "soft" as const }))} />
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10px] leading-relaxed text-faint">
            {geoInsight}
          </p>
        </Card>
      </div>

      {/* --------------------------- zone 3: funnel, efficiency, delivery */}
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
        <Card className="sx-animate sx-delay-1">
          <SectionHeading
            title="Reward funnel"
            action={<MiniChip kind="ver">REWARDEVENT</MiniChip>}
          />
          <FunnelSteps stages={funnelDetail.stages} />
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10px] leading-relaxed text-faint">
            Median scan→redeem:{" "}
            <strong className="text-text">
              {funnelDetail.medianRedeemHours}h
            </strong>{" "}
            · {funnelDetail.leadsPushed.toLocaleString()} consented leads pushed
            to Zoho CRM
          </p>
        </Card>

        <Card className="sx-animate sx-delay-2">
          <SectionHeading title="Efficiency" />
          <ul className="space-y-3">
            {efficiency.map((e) => (
              <li
                key={e.label}
                className="flex items-baseline justify-between gap-2"
              >
                <span className="text-[11px] text-muted">{e.label}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-sm font-semibold tabular-nums tracking-tight">
                    {e.value}
                  </span>
                  {e.benchDeltaPct !== null ? (
                    <span className="text-[10px] font-medium text-success">
                      {e.benchDeltaPct}% vs bench
                    </span>
                  ) : (
                    <MiniChip kind="att" />
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 border-t border-line-soft pt-2.5 text-[10px] text-faint">
            Benchmarks are BTG-curated category medians <MiniChip kind="est" />
          </p>
        </Card>

        <Card className="sx-animate sx-delay-3">
          <SectionHeading title="Delivery" />
          <ul className="space-y-3">
            <li className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted">Total views</span>
              <span className="flex items-baseline gap-1.5 text-sm font-semibold tabular-nums">
                {roiDelivery.views.toLocaleString()} <MiniChip kind="ver" />
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted">Engagements</span>
              <span className="flex items-baseline gap-1.5 text-sm font-semibold tabular-nums">
                {roiDelivery.engagements.toLocaleString()} <MiniChip kind="ver" />
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted">Deliverables</span>
              <span className="text-sm font-semibold tabular-nums">
                {roiDelivery.deliverablesDone}/{roiDelivery.deliverablesTotal} ·{" "}
                {roiDelivery.onTimePct}% on-time
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted">Leads</span>
              <span className="flex items-baseline gap-1.5 text-sm font-semibold tabular-nums">
                {roiDelivery.leads.toLocaleString()} <MiniChip kind="ver" />
              </span>
            </li>
          </ul>
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10px] text-faint">
            On-time from Deliverable due vs published timestamps
          </p>
        </Card>
      </div>

      {/* --------------------------- zone 4: content + recommendation */}
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr] xl:items-start">
        <Card className="sx-animate sx-delay-1 p-0">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold tracking-tight">Top content</h2>
          </div>
          <ul className="divide-y divide-line-soft">
            {topContentX.map((c) => (
              <li key={c.rank} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={[
                    "w-3 text-xs font-bold tabular-nums",
                    c.rank === 1 ? "text-accent" : "text-faint",
                  ].join(" ")}
                >
                  {c.rank}
                </span>
                <Monogram
                  text={c.initials}
                  shape="circle"
                  tone={c.rank === 1 ? "primary" : "neutral"}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{c.title}</p>
                  <p className="truncate text-[10px] text-faint">
                    {c.athlete} · {c.format} · {c.platform}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-semibold tabular-nums">
                    {compact(c.views)}
                  </p>
                  <p className="text-[10px] tabular-nums text-faint">
                    {c.engagementRate}% eng
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="space-y-3">
          <Card className="sx-animate sx-delay-2 border-primary/30 bg-gradient-to-br from-primary/15 to-surface">
            <p className="text-[10px] font-medium uppercase tracking-wider text-primary-soft">
              Recommendation
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Reels at the Creator tier drove your best views-per-dollar. Shift
              the appearance budget into 2 more reels and DC-area rewards for a
              projected{" "}
              <strong className="text-text">
                +{roiRecommendation.liftPct}% return
              </strong>{" "}
              <MiniChip kind="est" />.
            </p>
            <Link
              href="/sponsor/marketplace?from=report"
              className="mt-4 block rounded-lg bg-primary py-2.5 text-center text-xs font-medium text-white transition-colors hover:bg-primary-soft"
            >
              Plan the renewal →
            </Link>
          </Card>
          <p className="px-1 text-[10px] leading-relaxed text-faint">
            Media value is estimated · revenue is attributed via
            merchant-validated coupons, not payment-network data (§16 · §22).
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------ footer */}
      <div className="flex flex-wrap gap-3 text-[11px]">
        <Link
          href={`/admin/campaigns/${id}?from=report`}
          className="text-accent hover:underline"
        >
          → Operations view for this campaign
        </Link>
        <Link
          href="/admin/analytics?from=report"
          className="text-accent hover:underline"
        >
          → Reward analytics
        </Link>
      </div>

      <p className="text-[10px] text-faint">
        Campaign <code className="font-mono">{id}</code> · fixture data.
      </p>
    </div>
  );
}
