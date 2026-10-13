import Link from "next/link";

import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { FigureTile } from "@/components/forecast-bits";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { ConfidenceChip } from "@/components/pricing-panel";
import { ListFilter, ListSearch, ServerList } from "@/components/server-pager";
import { PagedTable, Primary, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import { SourceLabel } from "@/components/ui";
import { demoState } from "@/lib/demo";
import { cpm } from "@/lib/intelligence";
import { apiListQuery, textParam } from "@/lib/list-query";
import { PRICING_VIEWS, deltaOf, kindLabel, pricingView, samplePricingDesk, type PricingDesk } from "@/lib/pricing-live";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   Pricing intelligence — 3S2-FE-01 (Spec §16 P3-01). Every priced inventory
   item: its current rate, the CPM engine's recommendation, how far apart
   they are, and the model's confidence. Picking a row opens the panel
   (./[inventoryId]) with the full factor breakdown, the historical range
   and the override control.

   Reads  GET /intelligence/pricing?page&size&q&view   (3S2-BE-02, proposed
          contract in lib/pricing-live.ts). The KPI tiles read the engine's
          `summary`, counted over every item — never the page on screen.
   Until the engine is mounted the desk is its title and <EnginePending>,
   with no number at all ("FE only, honest empty states", 2026-10-13).
   ?demo=sample previews the live layout on SAMPLE_PRICING_DESK (dev only);
   ?demo=loading|empty|error as every desk.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/intelligence/pricing";
const TITLE = "Pricing";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function PricingPage({ searchParams }: { searchParams: SP }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;

  if (demo === "empty") {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <EmptyState mark="inbox" title="Nothing priced yet" hint="Recommendations appear for inventory once the CPM engine has sold lines to learn from." />
      </div>
    );
  }

  const sp = await searchParams;
  const view = pricingView(sp);
  const q = textParam(sp, "q");

  if (await wantsSample(searchParams)) {
    return (
      <div className="space-y-5">
        <SampleBanner />
        <h1 className="sx-page-title">{TITLE}</h1>
        <PricingDeskView desk={samplePricingDesk(q, view)} q={q} view={view} sample />
      </div>
    );
  }

  const read = await readEngine<PricingDesk>("pricing", `/intelligence/pricing${apiListQuery(sp, { q, view })}`);
  if (read.state === "pending") {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <EnginePending engine={read.engine} />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="sx-page-title">{TITLE}</h1>
      <PricingDeskView desk={read.data} q={q} view={view} />
    </div>
  );
}

function PricingDeskView({ desk, q, view, sample = false }: { desk: PricingDesk; q: string; view: string; sample?: boolean }) {
  const { summary, items, page } = desk;
  const filtered = Boolean(q || view);
  const columns: Column[] = [
    { key: "item", label: "Inventory item" },
    { key: "current", label: "Current CPM", num: true },
    { key: "rec", label: "Recommended", num: true },
    { key: "delta", label: "Against current" },
    { key: "conf", label: "Confidence" },
    { key: "open", label: "Open", srOnly: true },
  ];
  const href = (id: string) => `${PATH}/${encodeURIComponent(id)}${sample ? "?demo=sample" : ""}`;

  return (
    <>
      {/* FigureTile, not StatTile: StatTile keeps its caption and source chip on one unwrapped row, which spills past a phone's half-width tile. */}
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <FigureTile label="Items priced" value={summary.priced.toLocaleString("en-US")} caption="CPM engine" extra={<SourceLabel source="ESTIMATED" />} />
        <FigureTile label="Above current" value={summary.above.toLocaleString("en-US")} caption="recommended higher" extra={<SourceLabel source="ESTIMATED" />} />
        <FigureTile label="Below current" value={summary.below.toLocaleString("en-US")} caption="recommended lower" extra={<SourceLabel source="ESTIMATED" />} />
        <FigureTile label="Low confidence" value={summary.lowConfidence.toLocaleString("en-US")} caption="under 50% — check before quoting" extra={<SourceLabel source="ESTIMATED" />} />
      </dl>

      <ServerList>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ListSearch initial={q} placeholder="Item, athlete or property…" label="Search priced inventory" tone="admin" />
            <ListFilter
              param="view"
              value={view}
              label="Recommendation"
              allLabel="All recommendations"
              options={PRICING_VIEWS.map((v) => ({ value: v.value, label: v.label }))}
              tone="admin"
            />
          </div>

          {items.length === 0 ? (
            <EmptyState
              mark="inbox"
              title={filtered ? "No priced item matches" : "Nothing priced yet"}
              hint={filtered ? "Try another search or recommendation filter." : "Recommendations appear for inventory once the CPM engine has sold lines to learn from."}
            />
          ) : (
            <PagedTable bare page={page} noun="Items" filtered={filtered} label="Priced inventory" columns={columns}>
              {items.map((r, i) => {
                const d = deltaOf(r.currentCpmCents, r.recommendedCpmCents);
                return (
                  <Tr key={r.inventoryId} i={i} tone={r.stamp.confidence < 0.5 ? "warn" : undefined}>
                    <Td>
                      <Primary sub={`${kindLabel(r.kind)} · ${r.seller.name}${r.seller.kind === "PROPERTY" ? " (property)" : ""}`}>{r.title}</Primary>
                    </Td>
                    <Td label="Current CPM" num muted>{r.currentCpmCents === null ? "—" : cpm(r.currentCpmCents)}</Td>
                    <Td label="Recommended" num>
                      {/* One block wrapper per multi-part cell: a phone's stacked card makes a cell's direct children inline (globals.css). */}
                      <span className="block min-w-0">
                        <span className="block font-semibold text-text">{cpm(r.recommendedCpmCents)}</span>
                        {r.override && <span className="block text-[10px] text-muted">override {cpm(r.override.cpmCents)}</span>}
                      </span>
                    </Td>
                    <Td label="Against current">
                      <span className={d.direction === "up" ? "text-accent" : d.direction === "down" ? "text-danger" : "text-muted"}>
                        {d.direction === "up" ? "▲ " : d.direction === "down" ? "▼ " : ""}
                        {d.words}
                      </span>
                    </Td>
                    <Td label="Confidence">
                      <span className="block min-w-0">
                        <span className="block"><ConfidenceChip confidence={r.stamp.confidence} /></span>
                        <span className="mt-0.5 block font-mono text-[10px] text-faint">{r.stamp.modelVersion}</span>
                      </span>
                    </Td>
                    <Td act>
                      <Link
                        href={href(r.inventoryId)}
                        aria-label={`Open pricing for ${r.title}`}
                        className="inline-flex min-h-9 items-center justify-center rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2"
                      >
                        Open →
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </PagedTable>
          )}
        </div>
      </ServerList>
    </>
  );
}
