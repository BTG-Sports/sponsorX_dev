import { Badge, Button, Card, Meter, SectionHeading } from "@/components/ui";
import { CountUp } from "@/components/count-up";
import { EmptyState, SkeletonPage } from "@/components/states";
/* icons.ts, not portal-nav: this is a server component, and imports from a
   "use client" module arrive as opaque references — the trophy came through
   as undefined and the hero square rendered empty (QA sweep 2026-09-24). */
import { ICONS } from "@/components/icons";
import { demoState } from "@/lib/demo";
import { liveStudent } from "../live";
import { LiveStudentPoints, StudentUnlinked } from "../live-views";
import {
  POINT_RULES,
  student,
  studentPoints,
  studentSales,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Points — P1-FE-30, spec §5.5, §9. Deliberately unlike athlete earnings,
   because a parent reading points as dollars is a legal problem before a
   usability one. The distinctness is structural: no currency sign anywhere on
   the page, no money gradient, violet + trophy instead of earnings' payout
   green, a timeline instead of a payout table, and a card that says plainly
   what points are not. StudentPointAccrual has no cents column and no
   relation to Earning (§5.5); this page renders that fact.

   Redemption is a separately gated act — spec §14 keeps "points, scholarships
   or commission" an open business/legal question — so the one action here is
   disabled with that exact reason.
   -------------------------------------------------------------------------- */

export default async function StudentPointsPage({
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
    const live = await liveStudent(["sales", "points"]);
    if (live?.kind === "unlinked") return <StudentUnlinked title="Points" />;
    if (live) return <LiveStudentPoints live={live} />;
  }

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Points</h1>
      <p className="mt-1 text-xs text-muted">
        Recognition for published work and closed sales — never pay
      </p>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No points yet"
          hint="Your first approved piece or sales meeting starts the ledger."
          action={{ label: "See assignments", href: "/next/assignments" }}
        />
      </div>
    );
  }

  /* Progress to the next SALES_500 accrual, in violet pts language — the
     dollars that drive it live on /next/sales, not here. */
  const closedDollars =
    studentSales.reduce((s, r) => s + r.valueCents, 0) / 100;
  const progressDollars = closedDollars % 500;
  const milestonePct = Math.round((progressDollars / 500) * 100);

  return (
    <div className="space-y-6">
      {heading}

      {/* ------------------------------------------------------- balance */}
      <Card className="sx-animate relative overflow-hidden p-5 sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-14 -top-14 size-44 rounded-full bg-next opacity-[0.13] blur-[60px]"
        />
        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-next/12 text-next">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-6"
                aria-hidden="true"
              >
                <path d={ICONS.trophy} />
              </svg>
            </span>
            <p className="flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tabular-nums tracking-tight text-next">
                <CountUp value={studentPoints.balance} />
              </span>
              <span className="text-sm font-medium text-next">pts</span>
            </p>
          </div>
          <div className="min-w-0 flex-1 basis-60">
            <div className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="text-muted">
                Next sales milestone —{" "}
                <span className="font-semibold text-next">+100 pts</span> at
                your next $500 closed
              </span>
              <span className="tabular-nums text-muted">{milestonePct}%</span>
            </div>
            <div className="mt-1.5">
              <Meter value={milestonePct} tone="next" />
            </div>
            <p className="mt-1.5 text-[10px] text-faint">
              The dollars behind this live on My sales; points never carry a
              currency sign.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ------------------------------------------------------ history */}
        <section className="sx-animate sx-delay-1 min-w-0">
          <SectionHeading
            title="How you earned them"
            hint="Every accrual, newest first — written once, never edited"
          />
          <Card className="p-0">
            <ul className="divide-y divide-line-soft">
              {studentPoints.accruals.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="shrink-0 rounded-lg bg-next/12 px-2 py-1 text-xs font-bold tabular-nums text-next">
                    +{a.points}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* a ledger is a record — wrap to two lines rather than
                        truncating the label into gibberish at 390px */}
                    <span className="line-clamp-2 text-sm leading-snug">
                      {a.label}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-faint">
                      {a.on}
                    </span>
                  </span>
                  <Badge tone="neutral">
                    {a.reason.replace("_", " ").toLowerCase()}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* ================================================== rail */}
        {/* min-w-0 — the implicit track below xl honors min-content */}
        <div className="min-w-0 space-y-6">
          <section className="sx-animate sx-delay-2">
            <SectionHeading title="How points work" />
            <Card className="p-0">
              <ul className="divide-y divide-line-soft">
                {POINT_RULES.map((r) => (
                  <li key={r.reason} className="px-4 py-3">
                    <p className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="font-medium">{r.label}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-next">
                        {r.points === null ? "varies" : `+${r.points}`}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                      {r.how}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section className="sx-animate sx-delay-3">
            <SectionHeading title="What points are not" />
            <Card className="border-next/25">
              <p className="text-xs leading-relaxed text-muted">
                Points are not dollars, wages, or a balance owed to{" "}
                {student.firstName}. They never convert on this page — whether
                the programme ends up recognising them as scholarships or
                something else is a decision that has not been made, and
                nothing here presumes it. Sales money is a different record
                with different rules, on My sales.
              </p>
              <div className="mt-3">
                <Button
                  full
                  disabled
                  title="Redemption is a separately gated decision (spec §5.5, open question §14) — nothing converts in Phase 1"
                >
                  Redeem points
                </Button>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
