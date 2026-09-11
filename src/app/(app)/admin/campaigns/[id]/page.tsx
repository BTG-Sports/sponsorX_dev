import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { Badge, BlockedNotice, Card, Meter, SectionHeading } from "@/components/ui";
import { AreaChart, ChartLegend } from "@/components/charts";
import { MiniChip } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { resolveBack } from "@/lib/back";
import { demoState } from "@/lib/demo";
import { campaignDetailX } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Campaign Operations Dashboard — §9 screen 9, mockup screen 9.

   The mockup shows the sponsor-facing view: stat cards, performance chart,
   top content. §9.9 is the operations view — per-athlete acceptance, Campaign
   Orders, due dates, draft approval, published proof, under-delivery and
   issue flags — so the per-athlete roster is the substance of this page and
   is added below the mockup's blocks.
   -------------------------------------------------------------------------- */

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
  const from = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const back = resolveBack(from, "admin");

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
  const pct = Math.round((c.viewsDelivered / c.viewsTarget) * 100);
  const viewsRemaining = Math.max(0, c.viewsTarget - c.viewsDelivered);

  return (
    <div className="space-y-6">
      <BackLink target={back} />

      {/* --------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-[9px] font-semibold text-faint">
            BTG
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{c.name}</h1>
              <Badge tone="accent">Active</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              Presented by {c.presentedBy}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/campaigns/new?from=campaign"
            className="rounded-lg border border-line px-3.5 py-2 text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
          >
            Edit Campaign
          </Link>
          <Link
            href={`/sponsor/campaigns/${id}/report?from=campaign`}
            className="rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-white transition-colors hover:bg-primary-soft"
          >
            Sponsor report
          </Link>
        </div>
      </div>

      {/* ----------------------------------------------------------- tabs */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
        {c.tabs.map((t, i) => (
          <span
            key={t}
            title={i === 0 ? undefined : "Not built yet"}
            className={[
              "rounded-md px-3 py-1.5 text-xs font-medium",
              i === 0
                ? "bg-primary/15 text-primary-soft"
                : "cursor-default text-faint",
            ].join(" ")}
          >
            {t}
          </span>
        ))}
      </div>

      {/* ----------------------------------------------------- stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Views Delivered</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.viewsDelivered.toLocaleString()}
          </p>
          <p className="mt-1 text-[10px] text-faint">
            of {c.viewsTarget.toLocaleString()} target
          </p>
          <div className="mt-2">
            <Meter value={pct} tone={pct >= 90 ? "accent" : "primary"} />
          </div>
          <p className="mt-1 text-[10px] tabular-nums text-faint">
            {pct}% delivered · {viewsRemaining.toLocaleString()} views to
            target · {c.daysRemaining}d left
          </p>
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
            <span className="text-[11px] font-medium text-accent">+1.7%</span>
          </div>
          <div className="mt-2">
            <MiniChip kind="manual">VERIFIED · MANUAL</MiniChip>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Rewards Redeemed</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.rewardsRedeemed.toLocaleString()}
          </p>
          <div className="mt-2">
            <MiniChip kind="ver">POSTGRES</MiniChip>
          </div>
        </Card>

        <Card className="p-4">
          <p className="text-[11px] font-medium text-muted">Days Remaining</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {c.daysRemaining}
          </p>
        </Card>
      </div>

      {d.notice && <BlockedNotice>{d.notice}</BlockedNotice>}

      {/* ------------------------------------ performance + top content */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <SectionHeading
            title="Performance Over Time"
            action={<ChartLegend aName="Views" bName="Engagements" />}
          />
          <Card>
            <AreaChart
              points={d.series}
              aName="Views"
              bName="Engagements"
            />
          </Card>
        </section>

        <section className="min-w-0">
          <SectionHeading title="Top Content" />
          <Card className="p-0">
            <ul className="divide-y divide-line-soft">
              {d.topContent.map((t) => (
                <li key={t.title} className="flex items-center gap-3 px-4 py-3">
                  <div className="grid size-9 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-[8px] font-semibold text-faint">
                    BTG
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium">
                      {t.title}
                    </p>
                    <p className="truncate text-[10px] text-faint">
                      {t.athlete}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted">
                    {(t.views / 1000).toFixed(0)}K
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      </div>

      {/* --------------------------------- per-athlete operations (§9.9) */}
      <section>
        <SectionHeading
          title="Athlete roster"
          hint="§9.9 — acceptance, Campaign Orders, delivery and issue flags"
        />
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wider text-faint">
                  <th className="px-4 py-2.5 font-medium">Athlete</th>
                  <th className="px-4 py-2.5 font-medium">Order</th>
                  <th className="px-4 py-2.5 font-medium">Delivered</th>
                  <th className="px-4 py-2.5 text-right font-medium">Views</th>
                  <th className="px-4 py-2.5 font-medium">Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {d.roster.map((r) => (
                  <tr key={r.slug}>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/athletes/${r.slug}?from=campaign`}
                        className="text-xs font-medium hover:text-accent"
                      >
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        tone={
                          r.order === "ACCEPTED"
                            ? "accent"
                            : r.order === "DECLINED"
                              ? "danger"
                              : "warn"
                        }
                      >
                        {r.order.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={[
                          "text-xs tabular-nums",
                          r.delivered < r.planned ? "text-warn" : "text-accent",
                        ].join(" ")}
                      >
                        {r.delivered}/{r.planned}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs tabular-nums text-muted">
                      {r.views ? r.views.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {r.flag ? (
                        <Badge tone="danger">{r.flag}</Badge>
                      ) : (
                        <span className="text-[11px] text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="mt-2 text-[10px] text-faint">
          Campaign <code className="font-mono">{id}</code> · fixture data.
          Under-delivery and awaiting-acceptance are the two flags §9.9 names
          explicitly.
        </p>
      </section>
    </div>
  );
}
