import Link from "next/link";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { ChartLegend, LineChart } from "@/components/line-chart";
import {
  money,
  performanceSeries,
  rewardFunnel,
  sponsor,
  sponsorCampaigns,
  sponsorStats,
  topCampaign,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Sponsor Dashboard — §9 screen 3, mockup screen 3.

   The top half follows the mockup: Overview heading with a date-range control,
   four stat cards, Campaign Performance chart, Top Performing Campaign.

   The second half covers the §9.3 requirements the mockup thumbnail omits —
   spend, package status, athlete count, deliverables, the QR funnel split into
   its four events, and the renewal CTA.

   Data is fixtures. Nothing is wired.
   -------------------------------------------------------------------------- */

const CAMPAIGN_TONE = {
  ACTIVE: "accent",
  REPORTING: "primary",
  STAFFING: "warn",
  COMPLETED: "neutral",
} as const;

export default function SponsorDashboardPage() {
  const funnelMax = Math.max(...rewardFunnel.map((f) => f.value));
  const totalSpend = sponsorCampaigns.reduce((n, c) => n + c.spend, 0);

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------- overview heading */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-base font-semibold tracking-tight">Overview</h1>
        <button
          type="button"
          title="Date range picker — not wired"
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text"
        >
          {sponsor.dateRange}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="size-3"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* ------------------------------------------------------ stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sponsorStats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-[11px] font-medium text-muted">{s.label}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums tracking-tight">
                {s.value}
              </span>
              {s.delta && (
                <span className="text-[11px] font-medium tabular-nums text-accent">
                  +{s.delta}
                </span>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* -------------------------------- performance + top campaign */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <SectionHeading
            title="Campaign Performance"
            action={<ChartLegend aName="Views" bName="Engagements" />}
          />
          <Card>
            <LineChart
              points={performanceSeries}
              aName="Views"
              bName="Engagements"
            />
            <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
              Cumulative for the period. Views read against the left axis,
              engagements against the right — on a shared scale the engagements
              line would sit flat on the floor.
            </p>
          </Card>
        </section>

        <section className="min-w-0">
          <SectionHeading title="Top Performing Campaign" />
          <Card className="flex h-[calc(100%-2rem)] flex-col">
            <div className="flex items-start gap-3">
              {/* Campaign thumbnail. Real creative comes from the R2 public
                  bucket once assets exist. */}
              <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-[9px] font-semibold text-faint">
                BTG
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">
                  {topCampaign.name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted">
                  Presented by {topCampaign.presentedBy}
                </p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-[11px] text-muted">Views</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                  {topCampaign.views.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted">Engagement</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight">
                  {topCampaign.engagement.toLocaleString()}
                </dd>
              </div>
            </dl>

            <div className="mt-auto pt-5">
              <Link
                href="/sponsor/campaigns/c1/report"
                className="block rounded-lg bg-primary px-4 py-2.5 text-center text-xs font-medium text-white transition-colors hover:bg-primary-soft"
              >
                View Details
              </Link>
            </div>
          </Card>
        </section>
      </div>

      {/* ------------------------------ campaigns + funnel (§9.3 remainder) */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <SectionHeading
            title="Active campaigns"
            hint={`${money(totalSpend)} contracted across ${sponsorCampaigns.length} campaigns`}
          />
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                    <th className="px-4 py-2.5 font-medium">Campaign</th>
                    <th className="px-4 py-2.5 font-medium">Package</th>
                    <th className="px-4 py-2.5 font-medium">Athletes</th>
                    <th className="px-4 py-2.5 font-medium">Deliverables</th>
                    <th className="px-4 py-2.5 text-right font-medium">Spend</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {sponsorCampaigns.map((c) => {
                    const [done, total] = c.deliverables;
                    return (
                      <tr key={c.id}>
                        <td className="px-4 py-2.5 text-xs font-medium">
                          {c.name}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted">
                          {c.pkg}
                        </td>
                        <td className="px-4 py-2.5 text-xs tabular-nums text-muted">
                          {c.athletes}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={[
                              "text-xs tabular-nums",
                              done < total ? "text-warn" : "text-accent",
                            ].join(" ")}
                          >
                            {done}/{total}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-xs tabular-nums">
                          {money(c.spend)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={CAMPAIGN_TONE[c.state]}>
                            {c.state.toLowerCase()}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="mt-2 text-[10px] text-faint">
            Under-delivery shows amber. §9.9 makes flagging it the campaign
            manager&rsquo;s job, not something a sponsor has to notice.
          </p>
        </section>

        <div className="space-y-5">
          {/* -------------------------------------------- reward funnel */}
          <section>
            <SectionHeading
              title="Reward funnel"
              hint="§16 — four separate events"
            />
            <Card>
              <ul className="space-y-3">
                {rewardFunnel.map((f, i) => (
                  <li key={f.stage}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] text-muted">{f.stage}</span>
                      <span className="text-xs font-semibold tabular-nums">
                        {f.value.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={i === rewardFunnel.length - 1 ? "h-full rounded-full bg-accent" : "h-full rounded-full bg-primary"}
                        style={{ width: `${(f.value / funnelMax) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                Scan, landing, claim and redeem are stored as separate rows —
                the funnel is meaningless if they are collapsed into a counter.
              </p>
            </Card>
          </section>

          {/* ------------------------------------------------- renewal */}
          <section>
            <SectionHeading title="Renewal" />
            <Card>
              <p className="text-xs leading-relaxed text-muted">
                Player of the Week closes in 12 days. Renewing keeps the
                athlete roster and the category exclusivity.
              </p>
              <div className="mt-4 space-y-2">
                <button
                  type="button"
                  title="Creates a renewal opportunity in Zoho — not wired"
                  className="w-full rounded-lg bg-primary px-4 py-2.5 text-xs font-medium text-white transition-colors hover:bg-primary-soft"
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
    </div>
  );
}
