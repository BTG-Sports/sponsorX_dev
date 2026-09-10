import Link from "next/link";
import { Badge, Card, SectionHeading, SourceLabel } from "@/components/ui";
import { ChartLegend, LineChart } from "@/components/line-chart";
import {
  redemptionSeries,
  rewardStats,
  topLocations,
  topOffers,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Fan / Reward Analytics — mockup screen 11.

   Note the naming: the mockup's screen 11 is fan and reward analytics, while
   §9 screen 11 is the *athlete performance* dashboard. Both are required.
   This page is the mockup's; the athlete-performance half is stubbed at the
   bottom with what §22 asks for.

   The funnel is only meaningful because §16 stores scan, landing, claim and
   redeem as separate rows.
   -------------------------------------------------------------------------- */

export default function RewardAnalyticsPage() {
  const maxOffer = Math.max(...topOffers.map((o) => o.count));

  return (
    <div className="space-y-6">
      {/* --------------------------------------------------------- header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Reward Performance
          </h1>
          <p className="mt-1 text-xs text-muted">
            Fan funnel across all active campaigns.
          </p>
        </div>
        <button
          type="button"
          title="Range picker — not wired"
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:text-text"
        >
          Last 30 Days
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

      {/* ----------------------------------------------------- stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {rewardStats.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-[11px] font-medium text-muted">{s.label}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums tracking-tight">
                {s.value}
              </span>
              <span className="text-[11px] font-medium tabular-nums text-accent">
                +{s.delta}
              </span>
            </div>
            {s.source && (
              <div className="mt-2">
                <SourceLabel source={s.source} />
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {/* ----------------------------------------- redemptions chart */}
        <section className="min-w-0">
          <SectionHeading
            title="Redemptions Over Time"
            action={<ChartLegend aName="Redemptions" bName="Claims" />}
          />
          <Card>
            <LineChart
              points={redemptionSeries}
              aName="Redemptions"
              bName="Claims"
            />
            <p className="mt-3 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
              Claims run well ahead of redemptions — the gap between the two
              lines is the reward that was taken but never used, which is the
              number worth acting on.
            </p>
          </Card>
        </section>

        {/* ------------------------------------------------- locations */}
        <section className="min-w-0">
          <SectionHeading
            title="Top Locations"
            hint="Resolved in the worker; the fan IP is never stored"
          />
          <Card className="p-0">
            <ol className="divide-y divide-line-soft">
              {topLocations.map((l, i) => (
                <li
                  key={l.place}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <span className="w-3 shrink-0 text-[10px] tabular-nums text-faint">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px]">
                    {l.place}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {l.pct}%
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </section>
      </div>

      {/* -------------------------------------------------------- offers */}
      <section>
        <SectionHeading title="Top Offers" />
        <Card>
          <ul className="space-y-3">
            {topOffers.map((o) => (
              <li key={o.offer}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px]">{o.offer}</span>
                  <span className="text-[11px] font-semibold tabular-nums">
                    {o.count.toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${(o.count / maxOffer) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {/* --------------------------- the other screen 11 (§9.11) */}
      <section>
        <SectionHeading
          title="Athlete performance"
          hint="§9 screen 11 — a different dashboard with the same number"
        />
        <Card className="border-warn/30 bg-warn/8">
          <p className="text-[11px] leading-relaxed text-warn">
            The mockup&rsquo;s screen 11 is fan and reward analytics, above.
            §9&rsquo;s screen 11 is the athlete performance dashboard —
            per-athlete views, engagement, clicks, claims, redemptions,
            reliability, content quality and sponsor-performance history, with
            §22&rsquo;s six analytics layers and data-quality labels. Not built
            yet, and it is not a variant of this page.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
            <Link href="/admin/campaigns/c1" className="text-accent hover:underline">
              → Per-campaign roster (closest thing built)
            </Link>
            <Link href="/athlete" className="text-accent hover:underline">
              → Athlete&rsquo;s own view
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
