import { Card } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { EditionInventory, type InventoryRow } from "@/components/edition-inventory";
import { AddSlot } from "@/components/edition-sell";
import { EmptyState } from "@/components/states";
import { money } from "@/lib/fixtures";
import { inventoryTotals, toInventoryRows, type ApiLedgerSlot } from "@/lib/editions-live";
import { noEditionHint, readJson, type LiveEditions } from "../live";
import { EditionSwitcher, NextHeading } from "../editions/live-editions";

/* --------------------------------------------------------------------------
   P9-FE-04 — the ad slot inventory ledger on the real AdSlot table. Every
   row's state and buyer is GET /editions/:id/ledger's; a buyer the caller
   may not read (a student) reads "Taken". Adding a position is the
   editorial meeting's act — BTG only, and only before the edition closes;
   Postgres refuses a second back cover or presenting slot.
   -------------------------------------------------------------------------- */

const LAYOUT_ROLES = ["SUPER_ADMIN", "BTG_ADMIN"];

export async function LiveInventory({
  live,
  initial,
}: {
  live: LiveEditions;
  initial: { q?: string; state?: string; kind?: string };
}) {
  const e = live.current;
  if (!e) {
    return (
      <div className="space-y-6">
        <NextHeading title="Inventory" sub="Every sellable position, one ledger" />
        <EmptyState mark="chart" {...noEditionHint(live, "Inventory belongs to an edition — create one on its publication first.")} />
      </div>
    );
  }
  const { body } = await readJson<{ slots: ApiLedgerSlot[] }>(`/editions/${encodeURIComponent(e.id)}/ledger`);
  const rows = toInventoryRows(body?.slots ?? []) as InventoryRow[];
  const t = inventoryTotals(rows);

  const canLayout = live.roles.some((r) => LAYOUT_ROLES.includes(r));
  const layoutClosed = e.state !== "PLANNING" && e.state !== "SELLING";

  const tiles: Array<{ label: string; value: string; sub: string; violet?: boolean }> = [
    { label: "Committed", value: money(t.committed), sub: "sold value, frozen at sale", violet: true },
    { label: "Still on the rack", value: money(t.openRack), sub: "open positions at rack price" },
    { label: "Sell-through", value: `${t.sellThrough}%`, sub: `${t.soldCount} of ${rows.length} positions` },
    { label: "Full rack value", value: money(t.rack), sub: "if every position sold at rack" },
  ];

  return (
    <div className="space-y-6">
      <NextHeading
        title="Inventory"
        sub={`${e.label} · ${e.publication.name} · every sellable position, one ledger`}
        right={<EditionSwitcher editions={live.editions} current={e} base="/admin/next/inventory" />}
      />

      {canLayout && (
        <AddSlot
          editionId={e.id}
          disabledReason={layoutClosed ? `This edition is ${e.state.replace("_", " ").toLowerCase()} — positions are laid out while it is planning or selling.` : undefined}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          mark="chart"
          title="No inventory yet"
          hint="Slots appear when the edition's positions are set at the editorial meeting."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {tiles.map((x) => (
              <Card key={x.label} className="min-w-0 p-3.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{x.label}</p>
                <p className={["mt-1 text-lg font-semibold tabular-nums tracking-tight", x.violet ? "text-next" : ""].join(" ")}>{x.value}</p>
                <p className="mt-0.5 text-[10px] text-faint">{x.sub}</p>
              </Card>
            ))}
          </div>
          <div className="sx-animate">
            <EditionInventory rows={rows} initial={initial} editionId={e.id} live />
          </div>
        </>
      )}
      <p className="flex items-center gap-1.5 text-[10px] text-faint">
        the AdSlot ledger <MiniChip kind="ver">POSTGRES</MiniChip>
      </p>
    </div>
  );
}
