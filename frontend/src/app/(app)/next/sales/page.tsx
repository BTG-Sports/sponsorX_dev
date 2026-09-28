import { Badge, Button, Card, Meter, SectionHeading } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { liveStudent } from "../live";
import { LiveStudentSales, StudentUnlinked } from "../live-views";
import {
  PROSPECT_COPY,
  money,
  student,
  studentEdition,
  studentProspects,
  studentSales,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   My sales (P1-FE-19, spec §5.1, §5.6). Two very different lists on one page,
   and the design keeps them apart on purpose:

   - The pipeline is the student's — editable in spirit, alive, theirs to work.
   - The ledger is SponsorX's record — immutable SalesAttribution rows, value
     frozen at close, never self-reported, kept after graduation.

   A rejection renders with its reason code and the credit-kept promise,
   because spec §5.6 makes that a requirement, not a courtesy: refusing a
   sale the student couldn't have known was refusable must not cost them
   standing.
   -------------------------------------------------------------------------- */

const STAGE_TONE = {
  CONTACTED: "neutral",
  MEETING: "warn",
  SUBMITTED: "primary",
  REJECTED: "danger",
} as const;

export default async function StudentSalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  /* P9-FE-01 — a signed-in student reads their own records; ?demo= and BTG
     previews keep the fixture screen below. */
  if (!demo) {
    const live = await liveStudent(["code", "sales", "prospects"]);
    if (live?.kind === "unlinked") return <StudentUnlinked title="My sales" />;
    if (live) return <LiveStudentSales live={live} />;
  }

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My sales</h1>
        <p className="mt-1 text-xs text-muted">
          {studentEdition.label} · code{" "}
          <span className="font-semibold text-next">{student.salesCode}</span>
        </p>
      </div>
      <Button
        disabled
        title="Prospects are logged by SponsorX when your code is used — self-serve logging arrives with Stage 9 (P9-FE-01)"
      >
        Add a prospect
      </Button>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No sales yet — that's normal"
          hint="Your first pitch is the hard one. Take your code, start with a business that already knows your school."
          action={{ label: "Show my code", href: "/next/code" }}
        />
      </div>
    );
  }

  const closedCents = studentSales.reduce((s, r) => s + r.valueCents, 0);
  const pipeline = studentProspects.filter((p) => p.stage !== "REJECTED");
  const rejected = studentProspects.filter((p) => p.stage === "REJECTED");
  const pipelineCents = pipeline.reduce((s, p) => s + p.askCents, 0);

  /* SALES_500 milestone (spec §5.5): 100 pts per $500 closed. Progress is
     shown in violet pts language — the dollars stay on the dollar tiles. */
  const progressDollars = (closedCents / 100) % 500;
  const toNext = 500 - progressDollars;
  const milestonePct = Math.round((progressDollars / 500) * 100);

  return (
    <div className="space-y-6">
      {heading}

      {/* ----------------------------------------------------- stat tiles */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Closed this edition
          </p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {money(closedCents)}
            </span>
            <MiniChip kind="ver">RECORDED BY SPONSORX</MiniChip>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            In your pipeline
          </p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums tracking-tight">
              {money(pipelineCents)}
            </span>
            <span className="text-[11px] text-faint">
              across {pipeline.length} prospects
            </span>
          </p>
        </Card>
        <Card className="p-4 max-xl:col-span-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Next sales milestone
          </p>
          <p className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums tracking-tight text-next">
              +100
            </span>
            <span className="text-[11px] font-medium text-next">pts</span>
            <span className="text-[11px] text-faint">
              ${toNext} of closed sales away
            </span>
          </p>
          <div className="mt-2">
            <Meter value={milestonePct} tone="next" />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ==================================================== pipeline */}
        <section className="sx-animate min-w-0">
          <SectionHeading
            title={`Pipeline · ${pipeline.length}`}
            hint="Yours to work — most urgent first"
          />
          <div className="space-y-3">
            {pipeline.map((p) => (
              <Card key={p.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{p.business}</p>
                  <Badge tone={STAGE_TONE[p.stage]}>
                    {PROSPECT_COPY[p.stage]}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {p.slot} · asking {money(p.askCents)} · {p.contact}
                </p>
                {p.note && (
                  <p className="mt-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs leading-relaxed text-muted">
                    {p.note}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-faint">
                  last touch: {p.lastTouch}
                </p>
              </Card>
            ))}

            {rejected.map((p) => (
              <Card key={p.id} className="border-danger/25">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">{p.business}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge tone="danger">{PROSPECT_COPY[p.stage]}</Badge>
                    {/* the enum is an API constant, not UI copy; optional —
                        only some rejected rows carry a code */}
                    {p.reasonCode && (
                      <Badge tone="neutral">
                        {p.reasonCode.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {p.reason}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="size-3.5"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Sales credit kept
                  </span>
                  <span className="text-faint">{p.redirect}</span>
                </p>
              </Card>
            ))}
          </div>
        </section>

        {/* ====================================================== ledger */}
        <section className="sx-animate sx-delay-1 min-w-0">
          <SectionHeading
            title="Attribution ledger"
            hint="Permanent — recorded at close, kept after graduation"
          />
          <Card className="p-0">
            <ul className="divide-y divide-line-soft">
              {studentSales.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{s.business}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {s.slot} · slot {s.slotCode} · closed {s.closedOn}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {money(s.valueCents)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-line-soft px-4 py-3 text-[11px] leading-relaxed text-faint">
              Rows here are written by SponsorX when a sponsor pays — never
              self-reported, never edited, never deleted. If you graduate,
              transfer or leave the programme, this record stays yours.
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}
