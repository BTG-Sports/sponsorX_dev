import { Badge, Card, Meter, SectionHeading } from "@/components/ui";
import { HeroBand } from "@/components/hero";
import { EditionFlatplan } from "@/components/edition-flatplan";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  SLOT_RACK_CENTS,
  advisorContentQueue,
  clearanceQueue,
  editionBackCover,
  editionPages,
  money,
  student,
  studentEdition,
  type AdSlotKind,
  type EditionSlot,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Edition planning + the page map — P1-FE-21, spec §5.2, §8
   (docs/superpowers/specs/2026-09-24-edition-page-map-design.md).

   The one screen that renders scarcity against a position: the flatplan shows
   *where* in the magazine every dollar sits, the gates band shows whether the
   edition may print, and the close date counts down without being hovered.
   marketplace-catalog lists packages; nothing else in the app draws finite
   positional inventory against a deadline.

   Fixtures only (editionPages is the single source — the invariants suite
   pins the student portal's edition card to it). P9-FE-03 wires this to the
   real AdSlot ledger.
   -------------------------------------------------------------------------- */

/* Every gate derives from the fixture the rest of the app renders — a number
   typed here by hand drifts from the advisor desk the moment either changes. */
const piecesCleared = advisorContentQueue.filter((c) => c.clearedAt).length;

const GATES: Array<{ key: string; label: string; sub: string; pass: boolean }> = [
  {
    key: "content",
    label: "Content ready",
    sub: `${piecesCleared} of ${advisorContentQueue.length} pieces approved`,
    pass: piecesCleared === advisorContentQueue.length,
  },
  {
    key: "rights",
    label: "Rights cleared",
    sub: `${clearanceQueue.length} assets awaiting consent`,
    pass: clearanceQueue.length === 0,
  },
  {
    key: "revenue",
    label: "Revenue met",
    sub: "threshold below",
    pass: studentEdition.committedCents >= studentEdition.thresholdCents,
  },
];

export default async function EditionPlanningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  /* ?open=N — the inventory ledger's "Map →" lands on the right page drawer. */
  const sp = await searchParams;
  const openParam = typeof sp.open === "string" ? Number(sp.open) : NaN;
  const initialOpenPage = Number.isInteger(openParam) ? openParam : undefined;

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Editions{" "}
          <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-transparent">
            · SponsorX NEXT
          </span>
        </h1>
        <p className="mt-1 text-xs text-muted">
          {student.publication} · {student.school}
        </p>
      </div>
      {/* edition switcher — Winter exists but has no inventory yet */}
      <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
        <span className="rounded-md bg-next/15 px-3 py-1.5 text-xs font-medium text-next">
          {studentEdition.label}
        </span>
        <span
          className="cursor-not-allowed rounded-md px-3 py-1.5 text-xs font-medium text-faint"
          title="Winter 2026 is PLANNING — pages and slots are laid out at the editorial meeting"
        >
          Winter 2026
        </span>
      </div>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No edition in flight"
          hint="An edition starts SELLING once its page count and close date are set at the editorial meeting."
        />
      </div>
    );
  }

  const allSlots: EditionSlot[] = [
    ...editionPages.flatMap((p) => p.slots),
    editionBackCover,
  ];
  const count = (s: EditionSlot["state"]) =>
    allSlots.filter((x) => x.state === s).length;
  const pct = Math.round(
    (studentEdition.committedCents / studentEdition.thresholdCents) * 100,
  );
  const shortfall =
    studentEdition.thresholdCents - studentEdition.committedCents;
  const closeSoon = studentEdition.daysToClose <= 7;

  /* Sell-through by kind — sold / total per position kind, for the rail. */
  const kinds: AdSlotKind[] = ["FULL", "HALF", "QUARTER", "BACK_COVER"];
  const byKind = kinds.map((k) => {
    const of = allSlots.filter((s) => s.kind === k);
    return {
      kind: k,
      sold: of.filter((s) => s.state === "SOLD").length,
      total: of.length,
    };
  });
  const KIND_SHORT: Record<AdSlotKind, string> = {
    FULL: "Full pages",
    HALF: "Half pages",
    QUARTER: "Quarters",
    BACK_COVER: "Back cover",
  };

  return (
    <div className="space-y-6">
      {heading}

      {/* ------------------------------------------------- gates band */}
      <HeroBand border="border-next/30" className="sx-animate">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="primary">SELLING</Badge>
            <Badge tone={closeSoon ? "warn" : "neutral"}>
              closes {studentEdition.closeDate} · {studentEdition.daysToClose}{" "}
              days
            </Badge>
            <Badge tone="neutral">prints {studentEdition.publishTarget}</Badge>
          </div>

          {/* §5.2 — all three must hold for the planned format */}
          <div className="grid gap-2 sm:grid-cols-3">
            {GATES.map((g) => (
              <div
                key={g.key}
                className={[
                  "rounded-lg border px-3 py-2.5",
                  g.pass
                    ? "border-success/40 bg-success/8"
                    : "border-line bg-surface/60",
                ].join(" ")}
              >
                <p className="flex items-center gap-1.5 text-xs font-medium">
                  <span
                    aria-hidden="true"
                    className={g.pass ? "text-success" : "text-faint"}
                  >
                    {g.pass ? "✓" : "○"}
                  </span>
                  {g.label}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">{g.sub}</p>
              </div>
            ))}
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="text-muted">
                <span className="font-semibold text-text">
                  {money(studentEdition.committedCents)}
                </span>{" "}
                of {money(studentEdition.thresholdCents)} minimum viable —{" "}
                <span className="font-medium text-next">
                  {money(shortfall)} to go
                </span>
              </span>
              <span className="tabular-nums text-faint">{pct}%</span>
            </div>
            <div className="mt-1.5">
              <Meter value={pct} tone="next" />
            </div>
          </div>
        </div>
      </HeroBand>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ================================================= flatplan */}
        <section className="sx-animate sx-delay-1 min-w-0">
          <SectionHeading
            title="The flatplan"
            hint="Every position in the issue — tap a page for its slots"
          />
          <EditionFlatplan
            pages={editionPages}
            backCover={editionBackCover}
            closeDate={studentEdition.closeDate}
            initialOpenPage={initialOpenPage}
          />
        </section>

        {/* ===================================================== rail */}
        {/* min-w-0 — the implicit track below xl honors min-content
           (the P1-FE-19 overflow lesson) */}
        <div className="min-w-0 space-y-6">
          <section className="sx-animate sx-delay-2">
            <SectionHeading title="Inventory" />
            <Card>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-semibold tabular-nums text-next">
                    {count("SOLD")}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    sold
                  </p>
                </div>
                <div>
                  <p className="text-xl font-semibold tabular-nums">
                    {count("RESERVED")}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    reserved
                  </p>
                </div>
                <div>
                  <p className="text-xl font-semibold tabular-nums">
                    {count("OPEN")}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    open
                  </p>
                </div>
              </div>
              <ul className="mt-4 space-y-2.5 border-t border-line-soft pt-3.5">
                {byKind.map((k) => (
                  <li key={k.kind}>
                    <div className="flex items-baseline justify-between text-[11px]">
                      <span className="text-muted">{KIND_SHORT[k.kind]}</span>
                      <span className="tabular-nums text-faint">
                        {k.sold}/{k.total} sold
                      </span>
                    </div>
                    <div className="mt-1">
                      <Meter
                        value={(k.sold / k.total) * 100}
                        tone="next"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section className="sx-animate sx-delay-3">
            <SectionHeading title="Close date" />
            <Card>
              <p className="flex items-baseline gap-1.5">
                <span
                  className={[
                    "text-2xl font-semibold tabular-nums tracking-tight",
                    closeSoon ? "text-warn" : "",
                  ].join(" ")}
                >
                  {studentEdition.daysToClose}
                </span>
                <span className="text-[11px] text-faint">
                  days · ads close {studentEdition.closeDate}
                </span>
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Positions still open at close are filled editorially. The back
                cover cannot be sold after this date — a printed page has no
                second run.
              </p>
            </Card>
          </section>

          <section className="sx-animate sx-delay-4">
            <SectionHeading title="Rack card" />
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {kinds.map((k) => (
                  <li
                    key={k}
                    className="flex items-center justify-between px-4 py-2.5 text-xs"
                  >
                    <span className="text-muted">{KIND_SHORT[k]}</span>
                    <span className="font-medium tabular-nums">
                      {money(SLOT_RACK_CENTS[k])}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line-soft px-4 py-3 text-[10px] leading-relaxed text-faint">
                Rack prices; a sale&rsquo;s value is frozen at close and may
                differ (add-ons, co-ops). Repricing arrives with P9-FE-03.
              </p>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
