import { BlockedNotice, Button, Card } from "@/components/ui";
import {
  EditionInventory,
  type InventoryRow,
} from "@/components/edition-inventory";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { liveEditions } from "../live";
import { LiveInventory } from "./live-inventory";
import {
  SLOT_RACK_CENTS,
  editionBackCover,
  editionPages,
  money,
  studentEdition,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Ad slot inventory ledger — P1-FE-22, spec §8. The list behind the page map:
   every sellable position across the edition in one filterable table, state
   and buyer readable per row. Same editionPages fixture as the flatplan and
   the student portal — the invariants suite keeps all three telling one
   story. P9-FE-04 wires this to the real AdSlot table.
   -------------------------------------------------------------------------- */

export default async function InventoryLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const initial = {
    q: typeof sp.q === "string" ? sp.q : undefined,
    state: typeof sp.state === "string" ? sp.state : undefined,
    kind: typeof sp.kind === "string" ? sp.kind : undefined,
  };

  /* P9-FE-04 — a signed-in NEXT desk reads the real ledger. */
  if (!demo) {
    const live = await liveEditions(typeof sp.edition === "string" ? sp.edition : undefined);
    if (live) return <LiveInventory live={live} initial={initial} />;
  }

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Inventory{" "}
          <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-transparent">
            · SponsorX NEXT
          </span>
        </h1>
        <p className="mt-1 text-xs text-muted">
          {studentEdition.label} · every sellable position, one ledger
        </p>
      </div>
      <Button
        disabled
        title="Slots are authored at the editorial meeting — creation and repricing are wired by P9-FE-04 against the AdSlot ledger (Stage 9)"
      >
        Add a slot
      </Button>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No inventory yet"
          hint="Slots appear when an edition's page count and positions are set at the editorial meeting."
        />
      </div>
    );
  }

  const rows: InventoryRow[] = [
    ...editionPages.flatMap((p) =>
      p.slots.map(
        (s): InventoryRow => ({
          code: s.code,
          page: p.page,
          pageTitle: p.title,
          kind: s.kind,
          rackCents: SLOT_RACK_CENTS[s.kind],
          state: s.state,
          buyer: s.sponsor,
          holdFor: s.holdFor,
          soldCents: s.soldCents,
        }),
      ),
    ),
    {
      code: editionBackCover.code,
      page: 0,
      pageTitle: "Back cover",
      kind: editionBackCover.kind,
      rackCents: SLOT_RACK_CENTS.BACK_COVER,
      state: editionBackCover.state,
      buyer: editionBackCover.sponsor,
      holdFor: editionBackCover.holdFor,
      soldCents: editionBackCover.soldCents,
    },
  ];

  const rackTotal = rows.reduce((s, r) => s + r.rackCents, 0);
  const committed = rows.reduce((s, r) => s + (r.soldCents ?? 0), 0);
  const openRack = rows
    .filter((r) => r.state === "OPEN")
    .reduce((s, r) => s + r.rackCents, 0);
  const soldCount = rows.filter((r) => r.state === "SOLD").length;

  const TILES: Array<{ label: string; value: string; sub: string; violet?: boolean }> = [
    {
      label: "Committed",
      value: money(committed),
      sub: "sold value, frozen at close",
      violet: true,
    },
    {
      label: "Still on the rack",
      value: money(openRack),
      sub: "open positions at rack price",
    },
    {
      label: "Sell-through",
      value: `${Math.round((soldCount / rows.length) * 100)}%`,
      sub: `${soldCount} of ${rows.length} positions`,
    },
    {
      label: "Full rack value",
      value: money(rackTotal),
      sub: "if every position sold at rack",
    },
  ];

  return (
    <div className="space-y-6">
      {heading}

      {/* P7-QA-02: without ?demo= this fixture render reaches only signed-in
          staff outside NEXT_DESK_ROLES (CAMPAIGN_MGR, NETWORK_MGR) — the
          edition, rack and split figures below are sample data. */}
      {!demo && (
        <BlockedNotice>
          Demo data — your role doesn&rsquo;t read the live NEXT edition ledger,
          so every figure below is a sample edition&rsquo;s.
        </BlockedNotice>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {TILES.map((t) => (
          <Card key={t.label} className="p-3.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              {t.label}
            </p>
            <p
              className={[
                "mt-1 text-lg font-semibold tabular-nums tracking-tight",
                t.violet ? "text-next" : "",
              ].join(" ")}
            >
              {t.value}
            </p>
            <p className="mt-0.5 text-[10px] text-faint">{t.sub}</p>
          </Card>
        ))}
      </div>

      <div className="sx-animate">
        <EditionInventory rows={rows} initial={initial} />
      </div>
    </div>
  );
}
