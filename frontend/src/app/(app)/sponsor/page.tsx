import Link from "next/link";
import { Card, SectionHeading } from "@/components/ui";
import {
  AreaChart,
  BarStrip,
  FunnelSteps,
  TrustMeter,
  compact,
} from "@/components/charts";
import { ExportReport } from "@/components/export-report";
import { HeroBand, InsightStrip, MiniChip, Monogram } from "@/components/hero";
import { SponsorPortfolioList, SponsorPortfolioServer } from "@/components/sponsor-portfolio-list";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  toPortfolioRow,
  type ApiCampaign,
} from "@/lib/sponsor-live";
import { liveSponsorDashboard } from "@/server/sponsor";
import type { CampaignSummary } from "@/server/campaigns";
import type { PageInfo } from "@/lib/list-query";
import { buildSponsorReport } from "@/lib/report-data";
import {
  engagementSpark,
  funnelDetail,
  metricTrust,
  money,
  sponsor,
  sponsorBudget,
  sponsorCampaigns,
  sponsorCampaignsX,
  sponsorHero,
  sponsorInsights,
  topAthletes,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor Dashboard — §9 screen 3, redesigned per spec 2026-09-11
   ("Command Deck hero + Executive Bento").

   Every figure traces to MetricDaily, RewardEvent, Deliverable or Zoho Books
   and carries its provenance (§22): the projection is ESTIMATED and dashed,
   the break-even flag is attributed-revenue-vs-spend, and the trust meter is
   the provenance mix itself.

   LIVE vs DEMO (P4-FE-05, the P3-FE-02 precedent). A signed-in sponsor sees
   their REAL portfolio — GET /campaigns: state, package, window, athletes,
   delivery, contracted spend and the Zoho Books mirror's invoiced / paid.
   The results panels (views, engagement, funnel, return, top athletes) are
   the per-campaign report's (§9 screen 12, P7-FE-03) and are NOT drawn from
   fixtures beside real campaigns — the live page says where they live.
   Anyone else, or any ?demo= state, keeps the fixture deck below.
   -------------------------------------------------------------------------- */


function Kpi({
  k,
  v,
  sub,
  delay,
  bar,
}: {
  k: string;
  v: string;
  sub: string;
  delay: number;
  bar?: number | null;
}) {
  return (
    <Card className={`sx-animate sx-delay-${delay} p-4`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{k}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{v}</p>
      {typeof bar === "number" && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary" style={{ width: `${bar}%` }} />
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-faint">{sub}</p>
    </Card>
  );
}

function LiveDashboard({ summary, campaigns, page }: { summary: CampaignSummary; campaigns: ApiCampaign[]; page: PageInfo }) {
  const now = new Date();
  /* Headline numbers are the API's DB aggregate over the WHOLE portfolio
     (GET /campaigns/summary); the list below is one server page of it. */
  const t = {
    campaigns: summary.total,
    active: summary.active,
    athletes: summary.athletes,
    contracted: summary.contracted ?? null,
    invoiced: summary.invoiced ?? null,
    paid: summary.paid ?? null,
    budget: summary.budget ?? null,
  };
  const rows = campaigns.map((c) => toPortfolioRow(c, now));
  const sponsorName = campaigns[0]?.sponsorName ?? "Your campaigns";
  const paidPct =
    t.invoiced && t.paid !== null ? Math.round((t.paid / t.invoiced) * 100) : null;

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Campaign Overview</h1>
      <p className="mt-0.5 text-xs text-muted">
        {sponsorName}
        {t.campaigns > 0 &&
          ` · ${t.campaigns} ${t.campaigns === 1 ? "campaign" : "campaigns"}`}
      </p>
    </div>
  );

  if (t.campaigns === 0) {
    return (
      <div className="space-y-5">
        {heading}
        <EmptyState
          mark="chart"
          title="No campaigns yet"
          hint="Your dashboard fills in once BTG matches your first brief."
          action={{ label: "Browse the marketplace", href: "/sponsor/marketplace" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {heading}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          k="Active campaigns"
          v={String(t.active)}
          sub={`of ${t.campaigns} · campaign state in SponsorX`}
          delay={1}
        />
        <Kpi
          k="Spend"
          v={t.contracted !== null ? money(t.contracted) : "—"}
          sub={`contracted across your Campaign Orders${t.budget !== null ? ` · budget ${money(t.budget)}` : ""}`}
          delay={2}
        />
        <Kpi
          k="Invoiced"
          v={t.invoiced !== null ? money(t.invoiced) : "—"}
          bar={paidPct}
          sub={
            t.invoiced
              ? `${t.paid !== null ? money(t.paid) : "—"} paid · Zoho Books`
              : "no invoices yet · Zoho Books"
          }
          delay={3}
        />
        <Kpi
          k="Athletes"
          v={String(t.athletes)}
          sub="with a Campaign Order, across all campaigns"
          delay={4}
        />
      </div>

      <section className="min-w-0">
        <SectionHeading
          title="Campaign portfolio"
          hint={
            t.contracted !== null
              ? `${money(t.contracted)} contracted across ${t.campaigns} campaigns`
              : `${t.campaigns} campaigns`
          }
        />
        <Card className="p-0">
          <SponsorPortfolioServer rows={rows} page={page} />
        </Card>
        <p className="mt-2 text-[10px] text-faint">
          Pacing compares delivery progress against elapsed campaign time.
          Flagging under-delivery is the campaign manager&rsquo;s job (§9.9) —
          shown here so the sponsor never has to discover it.
        </p>
      </section>

      <Card className="p-4">
        <p className="text-xs font-semibold tracking-tight">
          Results live on each campaign&rsquo;s report
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          Views, engagement, the reward funnel and return are measured per
          campaign as deliverables publish, each labelled verified, attributed
          or estimated (§22).
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link
                href={`/sponsor/campaigns/${encodeURIComponent(c.id)}/report`}
                className="inline-block rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text"
              >
                {c.name} →
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const spentPct = Math.round((sponsorBudget.spent / sponsorBudget.contracted) * 100);

export default async function SponsorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const live = demo === null ? await liveSponsorDashboard(await searchParams) : null;
  if (live) return <LiveDashboard summary={live.summary} campaigns={live.rows} page={live.page} />;

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">
        Campaign Overview
      </h1>
      {demo === "empty" ? (
        <p className="mt-0.5 text-xs text-muted">{sponsor.name}</p>
      ) : (
        <p className="mt-0.5 text-xs text-muted">
          {sponsor.name} · {sponsorCampaigns.length} campaigns ·{" "}
          {sponsor.dateRange}
        </p>
      )}
    </div>
  );

  /* Brand-new sponsor tenant: no brief matched yet — the dashboard is only
     the next action, not zeros dressed up as a campaign portfolio. */
  if (demo === "empty") {
    return (
      <div className="space-y-5">
        {heading}
        <EmptyState
          mark="chart"
          title="No campaigns yet"
          hint="Your dashboard fills in once BTG matches your first brief."
          action={{ label: "Browse the marketplace", href: "/sponsor/marketplace" }}
        />
      </div>
    );
  }

  const totalSpend = sponsorCampaigns.reduce((n, c) => n + c.spend, 0);

  /* Shape the compact portfolio rows here (server) and hand them to the
     client island, which paginates them — a portfolio can outgrow one page. */
  const portfolioRows = sponsorCampaigns.map((c) => {
    const x = sponsorCampaignsX[c.id];
    const [done, total] = c.deliverables;
    return {
      id: c.id,
      name: c.name,
      pkg: c.pkg,
      athletes: c.athletes,
      endsIn: x.endsIn,
      monogram: x.monogram,
      views: x.views,
      spend: c.spend,
      done,
      total,
      behind: x.pacing === "BEHIND",
      state: c.state,
    };
  });

  return (
    <div className="space-y-5">
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {heading}
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Date range picker — not wired"
            className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text"
          >
            May 2026
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-3" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {/* Client-side export of the same report model this page draws;
              §19's render-report worker replaces the generation step later. */}
          <ExportReport
            payload={{ kind: "sponsor-dashboard", report: buildSponsorReport() }}
          />
        </div>
      </div>

      {/* ------------------------------------------------------- hero band */}
      <HeroBand className="sx-animate">
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
              Views delivered
            </p>
            <p className="sx-gradient-text mt-1 text-4xl font-bold tabular-nums tracking-tight sm:text-5xl">
              {sponsorHero.views.toLocaleString()}
            </p>
            <p className="mt-1.5 flex items-center gap-2 text-xs text-muted">
              <MiniChip kind="ver">▲ {sponsorHero.deltaPct}% · VER</MiniChip>{" "}
              vs April
            </p>

            <p className="mt-4 text-[11px] text-muted">
              Pacing{" "}
              <strong className="text-text">{sponsorHero.pacingPct}%</strong> of
              the {compact(sponsorHero.target)} season target
            </p>
            <div className="mt-1.5 h-1.5 w-full max-w-44 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-primary-soft"
                style={{ width: `${Math.min(sponsorHero.pacingPct, 100)}%` }}
              />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-faint">
              On pace for{" "}
              <MiniChip kind="est">{sponsorHero.projectedTotal} · EST</MiniChip>{" "}
              by season end
            </p>
          </div>

          <div className="min-w-0">
            <AreaChart
              points={sponsorHero.series}
              aName="Views"
              bName="Engagements"
              projection={sponsorHero.projection}
              marker={{
                index: sponsorHero.breakEvenIndex,
                label: sponsorHero.breakEvenLabel,
              }}
              xTicks={4}
              height={210}
            />
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-primary" /> Views · MetricDaily
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-3 rounded bg-accent" /> Engagements
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-0 w-3 border-t border-dashed border-primary-soft"
                />
                projection (EST)
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true">⚑</span> attributed value crossed
                spend
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <InsightStrip items={sponsorInsights} />
        </div>
      </HeroBand>

      {/* ------------------------------------------------------- bento KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="sx-animate sx-delay-1 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Engagements
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
            42,815{" "}
            <span className="text-xs font-medium text-success">+8.7%</span>
          </p>
          <div className="mt-2">
            <BarStrip points={engagementSpark} />
          </div>
          <p className="mt-1.5 text-[10px] text-faint">
            5.2% avg rate · MetricDaily
          </p>
        </Card>

        <Card className="sx-animate sx-delay-2 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Spend
          </p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">
            {money(sponsorBudget.spent)}
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${spentPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-[10px] text-faint">
            {spentPct}% of {money(sponsorBudget.contracted)} · Zoho Books
          </p>
        </Card>

        <Card className="sx-animate sx-delay-3 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Reward funnel
          </p>
          <div className="mt-2">
            <FunnelSteps stages={funnelDetail.stages} compact />
          </div>
          <p className="mt-1.5 text-[10px] text-faint">
            <strong className="text-accent">{funnelDetail.overallPct}%</strong>{" "}
            convert · median {funnelDetail.medianRedeemHours}h to redeem
          </p>
        </Card>

        <Card className="sx-animate sx-delay-4 border-accent/35 bg-gradient-to-br from-accent/15 to-surface p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-accent-soft">
            Return
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight text-accent">
            2.73×
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[10px] text-accent-soft">
            $52.5K attributed ÷ $19.2K <MiniChip kind="att" />
          </p>
          <Link
            href="/sponsor/campaigns/c1/report"
            className="mt-2 inline-block text-[11px] font-medium text-primary-soft hover:underline"
          >
            Full ROI report →
          </Link>
        </Card>
      </div>

      {/* ------------------------------------------------------ trust meter */}
      <Card className="sx-animate sx-delay-5 py-3.5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <p
            className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted"
            title="§22 — provenance of every metric on this page"
          >
            Data trust
          </p>
          <div className="min-w-0 flex-1">
            <TrustMeter segments={metricTrust} />
          </div>
        </div>
      </Card>

      {/* --------------------------------------------- portfolio + rail */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <section className="min-w-0">
          <SectionHeading
            title="Campaign portfolio"
            hint={`${money(totalSpend)} contracted across ${sponsorCampaigns.length} campaigns`}
          />
          <Card className="p-0">
            <SponsorPortfolioList rows={portfolioRows} />
          </Card>
          <p className="mt-2 text-[10px] text-faint">
            Pacing compares delivery progress against elapsed campaign time.
            Flagging under-delivery is the campaign manager&rsquo;s job (§9.9) —
            shown here so the sponsor never has to discover it.
          </p>
        </section>

        <div className="space-y-5">
          {/* ------------------------------------------------ leaderboard */}
          <section>
            <SectionHeading
              title="Top athletes"
              hint="MetricDaily by athlete"
            />
            <Card>
              <ul className="space-y-3">
                {topAthletes.map((a) => (
                  <li key={a.rank} className="flex items-center gap-3">
                    <span
                      className={[
                        "w-3 text-xs font-bold tabular-nums",
                        a.rank === 1 ? "text-accent" : "text-faint",
                      ].join(" ")}
                    >
                      {a.rank}
                    </span>
                    <Monogram
                      text={a.initials}
                      shape="circle"
                      tone={a.rank === 1 ? "primary" : "neutral"}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{a.name}</p>
                      {a.flag && (
                        <p className="text-[10px] text-warn">▲ {a.flag}</p>
                      )}
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-muted">
                      {compact(a.views)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {/* --------------------------------------------------- renewal */}
          <section>
            <SectionHeading title="Renewal" />
            <Card className="border-primary/30 bg-gradient-to-br from-primary/15 to-surface">
              <p className="text-xs font-semibold tracking-tight">
                Player of the Week closes in 12 days
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Renewing keeps your athlete roster and the category exclusivity.
              </p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  title="Creates a renewal opportunity in Zoho via the queue — not wired"
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
                >
                  Discuss renewal
                </button>
                <Link
                  href="/sponsor/marketplace"
                  className="block rounded-lg border border-line px-4 py-2.5 text-center text-xs font-medium text-text transition-colors hover:bg-surface-2"
                >
                  Browse packages
                </Link>
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-faint">
                §18 creates the renewal Deal in Zoho through the queue — never
                inline from this request.
              </p>
            </Card>
          </section>
        </div>
      </div>

      <p className="text-[10px] text-faint">
        All figures are fixture data shaped to MetricDaily, RewardEvent,
        Deliverable and Zoho Books — every number on this page has a retrieval
        path, and the soft ones say so.
      </p>
    </div>
  );
}
