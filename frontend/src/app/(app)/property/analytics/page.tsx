import { HBarList } from "@/components/charts";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { buildAnalytics, type ApiAnalytics } from "@/lib/property-p2-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Analytics — 2S7-FE-01 (design Analytics.dc.html). How the property's
   inventory is selling. Counts recorded by SponsorX; nothing estimated.

   Reads GET /team/analytics   revenue (booked · reversed · net · byMonth),
                               campaignCompletion (rate may be null),
                               sellThrough (rate may be null), sponsorMix by
                               category, averageCpm (null) + averageCpmBasis

   PROPERTY_MGR only; a 403 is a login with no property. Honest gaps: no
   date filter (the API has none — the design's period picker is left out),
   no listing views or purchase requests (not recorded), no CPM (the API's
   own reason is shown instead of a number), sell-through covers the team's
   own items only, and payout trends are always 0 so they are not charted.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyAnalyticsPage() {
  await requirePortalAccess("property");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
      <p className="mt-1 text-xs text-muted">How your inventory is selling, all time. Counts recorded by SponsorX; nothing estimated.</p>
    </div>
  );

  const res = await apiFetch("/team/analytics");
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="chart" title="No property is linked to this login" hint="Analytics belong to a property's manager. Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Analytics unavailable (${res.status}).`);
  const a = buildAnalytics((await res.json()) as ApiAnalytics);

  return (
    <div className="space-y-6">
      {heading}

      {!a.reconciles && (
        <p role="alert" className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-warn">
          The revenue figures don&rsquo;t reconcile with the ledger right now. Treat them as provisional and check with BTG.
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {a.kpis.map((k) => (
          <li key={k.key} className="rounded-xl border border-line bg-surface p-4">
            <p className="flex items-center justify-between gap-2 text-[11px] text-muted">
              {k.label}
              <Badge tone="accent">measured</Badge>
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{k.value}</p>
            <p className="mt-0.5 text-[11px] text-faint">{k.sub}</p>
          </li>
        ))}
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11px] text-muted">Average CPM</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{a.cpm.value ?? "—"}</p>
          <p className="mt-0.5 text-[11px] text-faint">{a.cpm.basis}</p>
        </li>
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Net revenue by month" hint="Your share, booked less reversed, in the month each was posted." />
          <Card>
            {a.months.length === 0 ? (
              <p className="text-xs text-muted">Nothing booked yet. Months appear from your first booked order.</p>
            ) : (
              <HBarList rows={a.months} />
            )}
          </Card>
        </section>

        <section>
          <SectionHeading title="Sponsor mix" hint="Booked revenue by the sponsor's main category. Sponsor names aren't shared." />
          <Card>
            {a.mix.length === 0 ? <p className="text-xs text-muted">No sponsor orders booked yet.</p> : <HBarList rows={a.mix} />}
          </Card>
        </section>
      </div>

      <section>
        <SectionHeading title="Sell-through by item" hint="Units sponsors have contracted, against the item's stock. Your team's own items; roster athletes' items aren't counted here yet." />
        {a.sellThrough.length === 0 ? (
          <EmptyState mark="chart" title="No team items yet" hint="Sell-through appears once your team has items in Inventory." />
        ) : (
          <Card className="p-0">
            <div className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint">
              <span>Item</span>
              <span className="text-right">Stock</span>
              <span className="text-right">Sold</span>
              <span className="text-right">Rate</span>
            </div>
            <ul className="divide-y divide-line-soft">
              {a.sellThrough.map((s) => (
                <li key={s.id} className="grid grid-cols-[1fr_4.5rem_4.5rem_4.5rem] items-center gap-x-3 px-4 py-2.5 text-xs tabular-nums">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{s.title}</span>
                    <span className="block text-[11px] text-muted">{s.kind}</span>
                  </span>
                  <span className="text-right text-muted">{s.stock}</span>
                  <span className="text-right">{s.sold}</span>
                  <span className="text-right font-medium">{s.rate}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <p className="mt-2 text-[11px] text-faint">A rate of &ldquo;—&rdquo; means the item has open or zero stock, so there is nothing to divide by.</p>
      </section>
    </div>
  );
}
