import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { ExportReport } from "@/components/export-report";
import { Badge, Card, SectionHeading, SourceLabel } from "@/components/ui";
import { notFound } from "next/navigation";
import {
  deliveredShare,
  engagementRate,
  reachLayers,
  type ApiSponsorReport,
} from "@/lib/report-live";
import { apiFetch, fetchActor } from "@/server/api";
import {
  AreaChart,
  Donut,
  FunnelSteps,
  HBarList,
  RadialGauge,
  compact,
} from "@/components/charts";
import { HeroBand, MiniChip, Monogram } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { resolveBack } from "@/lib/back";
import { buildCampaignRoiReport } from "@/lib/campaign-report-data";
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

   "Export report" ships this screen as a client-rendered PDF or XLSX from
   the same CampaignRoiReport model; the §19 worker (Playwright render, B7)
   takes over the generation step when it lands.

   LIVE vs DEMO (P7-FE-03, the P3-FE-02 precedent). For a signed-in sponsor
   (their own campaign) or BTG, the id is a REAL campaign and the page renders
   GET /campaigns/{id}/report — with §22's layers kept apart: reach per
   provenance side by side and never summed, media value ESTIMATED with its
   stated basis, tracked clicks ATTRIBUTED, the fan funnel measured from our
   own event rows. The fixture composition charts (format / platform / geo
   splits, benchmarks, timeline) have no source in the report yet and are not
   drawn; the export is hidden on live numbers (its model is fixture-built).
   -------------------------------------------------------------------------- */

const REPORT_ROLES = ["SUPER_ADMIN", "BTG_ADMIN", "CAMPAIGN_MGR", "SALES", "SPONSOR_ADMIN", "SPONSOR_ANALYST"];

async function liveReport(id: string): Promise<ApiSponsorReport | "missing" | null> {
  /* No catch — an outage is an error page, never fixtures dressed as the
     sponsor's real results (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => REPORT_ROLES.includes(r))) return null;
  const res = await apiFetch(`/campaigns/${encodeURIComponent(id)}/report`);
  if (res.status === 403) return "missing";
  if (!res.ok) throw new Error(`Report unavailable (${res.status}).`);
  return (await res.json()) as ApiSponsorReport;
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function LiveReport({ r, back }: { r: ApiSponsorReport; back: { href: string; label: string } }) {
  const layers = reachLayers(r.performance);
  const d = deliveredShare(r.roster);
  const f = r.funnel;
  const clicks = r.deliveredAssets.reduce((n, a) => n + a.trackedClicks, 0);
  return (
    <div className="space-y-5">
      <BackLink target={back} />
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Campaign ROI Report</h1>
        <p className="mt-1 text-xs text-muted">
          {r.campaign.name} · {fmtDay(r.campaign.startDate)} – {fmtDay(r.campaign.endDate)} ·{" "}
          <Badge tone={r.campaign.state === "ACTIVE" ? "accent" : "neutral"}>{r.campaign.state.toLowerCase()}</Badge>
        </p>
        {r.objective && <p className="mt-1 text-[11px] text-faint">Objective: {r.objective}</p>}
      </div>

      <HeroBand className="sx-animate">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Reach, by how we know it</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {layers.map((l) => (
            <div key={l.key}>
              <p className="flex items-center gap-2 text-[11px] text-muted">
                {l.label} views {l.chip ? <SourceLabel source={l.chip} /> : <span className="text-faint">· no data</span>}
              </p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">{l.views.toLocaleString("en-US")}</p>
              <p className="mt-0.5 text-[11px] text-faint">
                {l.engagements.toLocaleString("en-US")} engagements
                {engagementRate(l.views, l.engagements) !== null && ` · ${engagementRate(l.views, l.engagements)}% rate`}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-faint">
          Each layer stands alone — a self-reported or estimated view is never added to a verified one (§22).
        </p>
      </HeroBand>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            {/* P7-QA-02: the API's "mediaValue" is spend ÷ verified views × 1000
                — a cost per thousand, not the worth of the exposure. Titled for
                what it is, to the cent (money() rounds a $0.40 CPM to "$0"),
                and a dash when there were no verified views to divide by. */}
            Cost per 1,000 verified views <SourceLabel source="ESTIMATED" />
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
            {r.mediaValue.amount > 0 ? `$${(r.mediaValue.amount / 100).toFixed(2)}` : "—"}
          </p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-faint">{r.mediaValue.basis}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Delivery</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
            {d.verified} <span className="text-sm font-medium text-muted">of {d.total} verified</span>
          </p>
          <p className="mt-1.5 text-[10px] text-faint">deliverables confirmed live by BTG</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            Link clicks <SourceLabel source="ATTRIBUTED" />
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{clicks.toLocaleString("en-US")}</p>
          <p className="mt-1.5 text-[10px] text-faint">counted on our own tracking links, not a platform figure</p>
        </Card>
      </div>

      <section>
        <SectionHeading title="Reward funnel" hint="Four separate events from the fan page — measured by SponsorX (§16)." />
        <Card>
          <FunnelSteps
            stages={[
              { label: "Scan", value: f.SCAN },
              { label: "Landing", value: f.LANDING },
              { label: "Claim", value: f.CLAIM },
              { label: "Redeem", value: f.REDEEM },
            ]}
          />
          <p className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-3 text-[11px] text-muted">
            {r.redemption.redeemed.toLocaleString("en-US")} redeemed of {r.redemption.issued.toLocaleString("en-US")} issued
            {r.redemption.issued ? ` · ${Math.round(r.redemption.rate * 1000) / 10}%` : ""} <SourceLabel source="VERIFIED_SYSTEM" />
          </p>
        </Card>
      </section>

      {r.observations.length > 0 && (
        <section>
          <SectionHeading title="What stands out" hint="Computed from the figures above." />
          <Card>
            <ul className="space-y-1.5 text-xs leading-relaxed text-muted">
              {r.observations.map((o) => (
                <li key={o}>· {o}</li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionHeading title="Roster delivery" />
        <Card className="p-0">
          {r.roster.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">No athletes on this campaign yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {r.roster.map((l) => (
                <li key={`${l.athleteId}-${l.jobId}`} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                  <span className="min-w-0">
                    <span className="font-medium">{l.athleteName}</span>
                    <span className="ml-2 text-faint">{l.jobId} · {l.orderState.toLowerCase()}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {l.deliverablesVerified}/{l.deliverablesTotal} verified
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <SectionHeading title="Published content" />
        <Card className="p-0">
          {r.deliveredAssets.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted">Nothing published yet.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {r.deliveredAssets.map((a) => (
                <li key={a.deliverableId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs">
                  <span className="min-w-0">
                    <span className="font-medium">{a.title}</span>
                    {a.publishedAt && <span className="ml-2 text-faint">{fmtDay(a.publishedAt)}</span>}
                    {a.publishedUrl && (
                      <a href={a.publishedUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-primary underline underline-offset-2">
                        view post
                      </a>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {a.trackedClicks.toLocaleString("en-US")} clicks <SourceLabel source="ATTRIBUTED" />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {r.adPlacements.length > 0 && r.editionEngagement && (
        <section>
          <SectionHeading title="Edition placements" hint="Print and digital kept apart — pooling them would say something untrue." />
          <Card>
            <p className="text-xs text-muted">
              {r.adPlacements.length} position{r.adPlacements.length === 1 ? "" : "s"} ·{" "}
              {r.editionEngagement.print.QR_SCAN.toLocaleString("en-US")} print QR scans ·{" "}
              {r.editionEngagement.digital.LINK_CLICK.toLocaleString("en-US")} digital link clicks
            </p>
          </Card>
        </section>
      )}
    </div>
  );
}

export default async function RoiReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const fromParam = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  /* Reached from this campaign's own dashboard — return to it. The static
     back-link map can't express an id-dynamic target, so resolve it inline. */
  const back =
    fromParam === "sponsor-campaign"
      ? { href: `/sponsor/campaigns/${id}`, label: "Back to campaign" }
      : resolveBack(fromParam, "sponsor");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">
        Campaign ROI Report
      </h1>
      {demo === "empty" ? (
        <p className="mt-1 text-xs text-muted">Campaign {id}</p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          {roiReport.campaign} · Presented by {roiReport.presentedBy} ·{" "}
          {roiReport.period}
        </p>
      )}
    </div>
  );

  const live = demo === null ? await liveReport(id) : null;
  if (live === "missing") notFound();
  if (live) return <LiveReport r={live} back={back} />;

  /* Report builds from verified deliverables and rolled-up metrics — nothing
     to gauge or chart until the first ones land. */
  if (demo === "empty") {
    return (
      <div className="space-y-5">
        <BackLink target={back} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          {heading}
        </div>
        <EmptyState
          mark="chart"
          title="No report data yet"
          hint="The ROI report builds as deliverables verify and metrics roll up."
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BackLink target={back} />

      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        {heading}
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
          {/* Client-side export of this screen's report model; §19's worker
              (Playwright render, B7) replaces the generation step later. */}
          <ExportReport
            payload={{ kind: "campaign-roi", report: buildCampaignRoiReport(id) }}
          />
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
                Views priced at curated CPM
              </p>
              <p className="mt-0.5 flex items-baseline gap-2 text-base font-medium tabular-nums text-muted">
                {money(roiGauge.mediaValue)}
                <MiniChip kind="est">EST · curated CPM</MiniChip>
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
                    <span className="flex items-baseline gap-1 text-[10px] font-medium text-success">
                      {e.benchDeltaPct}% vs bench
                      {/* Derived from a curated median — inherits its label (P7-QA-02). */}
                      <MiniChip kind="est">EST · curated</MiniChip>
                    </span>
                  ) : (
                    <MiniChip kind="att" />
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 border-t border-line-soft pt-2.5 text-[10px] text-faint">
            Benchmarks are BTG-curated category medians <MiniChip kind="est">EST · curated</MiniChip>
          </p>
        </Card>

        <Card className="sx-animate sx-delay-3">
          <SectionHeading title="Delivery" />
          <ul className="space-y-3">
            <li className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted">Total views</span>
              <span className="flex items-baseline gap-1.5 text-sm font-semibold tabular-nums">
                {roiDelivery.views.toLocaleString()} <MiniChip kind="manual" />
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-2">
              <span className="text-[11px] text-muted">Engagements</span>
              <span className="flex items-baseline gap-1.5 text-sm font-semibold tabular-nums">
                {roiDelivery.engagements.toLocaleString()} <MiniChip kind="manual" />
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
        {/* min-w-0: the implicit single column below xl must be allowed to
            shrink under the content rows' min-content (P1-QA-03, 360px). */}
        <Card className="min-w-0 sx-animate sx-delay-1 p-0">
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
              className="mt-4 block rounded-lg bg-primary py-2.5 text-center text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
            >
              Plan the renewal →
            </Link>
          </Card>
          <p className="px-1 text-[10px] leading-relaxed text-faint">
            Views priced at curated CPMs are estimated · revenue is attributed via
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
