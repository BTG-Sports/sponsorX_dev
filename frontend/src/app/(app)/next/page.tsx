import Link from "next/link";
import { Badge, Button, Card, Meter, SectionHeading } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { CountUp } from "@/components/count-up";
import { HeroBand, MiniChip } from "@/components/hero";
import { JourneyStrip, type JourneyStep } from "@/components/journey-strip";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  PROSPECT_COPY,
  STUDENT_ASSIGNMENT_COPY,
  money,
  student,
  studentAssignments,
  studentEdition,
  studentPoints,
  studentProspects,
  studentSales,
  studentSalesTrend,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Student home — SponsorX NEXT (P1-FE-19, spec §8, §9). Designed at 390px and
   widened: one column, thumb-reach actions, the desktop grid is the widened
   view. The page answers three questions in order — what's happening with my
   edition, what do I do next, what have I earned — and the earned column is
   points, which must never read as money (spec §5.5): no $ sign near a points
   figure, violet not success-green, "pts" spelled out.

   Everything renders from fixtures. Actions that need the backend are
   disabled with the reason in their tooltip, never hidden (Stage 9 wiring is
   P9-FE-01…P9-FE-06).
   -------------------------------------------------------------------------- */

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};
const dueKey = (s: string) => {
  const [mon, day] = s.split(" ");
  const m = MONTHS[mon?.slice(0, 3)];
  return m ? m * 100 + Number(day ?? 0) : Number.MAX_SAFE_INTEGER;
};

export default async function StudentHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {student.firstName}&rsquo;s newsroom
        </h1>
        <p className="mt-1 text-xs text-muted">
          {student.publication} · {student.school} · Class of {student.gradYear}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {student.masthead.map((role) => (
          <Badge key={role} tone="primary">
            {role.toLowerCase()}
          </Badge>
        ))}
      </div>
    </div>
  );

  /* A brand-new student: no assignments, no pipeline — the screen is the
     first step, not a wall of zeros. */
  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="Your first edition starts here"
          hint="Your advisor assigns work; your sales code is ready the moment you pitch a business."
          action={{ label: "See your code", href: "/next/code" }}
        />
      </div>
    );
  }

  const salesTotalCents = studentSales.reduce((s, r) => s + r.valueCents, 0);
  const due = [...studentAssignments]
    .filter((a) => a.state === "NOT_STARTED")
    .sort((x, y) => dueKey(x.due) - dueKey(y.due));
  const inFlight = studentAssignments.filter(
    (a) => a.state !== "NOT_STARTED" && a.state !== "PUBLISHED" && a.state !== "VERIFIED",
  );
  const pipeline = studentProspects.filter((p) => p.stage !== "REJECTED");
  const meeting = studentProspects.find((p) => p.stage === "MEETING");
  const submitted = studentProspects.find((p) => p.stage === "SUBMITTED");
  const editionPct = Math.round(
    (studentEdition.committedCents / studentEdition.thresholdCents) * 100,
  );
  const slotsOpen =
    studentEdition.slotsTotal - studentEdition.slotsSold - studentEdition.slotsReserved;
  const closeSoon = studentEdition.daysToClose <= 7;

  /* The loop this portal teaches: pitch → close → create → points. Counts
     derive from the same rows as the queue, so the two cannot disagree. */
  const journeySteps: JourneyStep[] = [
    { label: "Pitch a business", sub: `${pipeline.length} in play`, href: "/next/sales" },
    { label: "Close the sale", sub: `${money(salesTotalCents)} closed`, href: "/next/sales" },
    { label: "Create for the edition", sub: `${due.length} due`, href: "/next/assignments" },
    { label: "Earn points", sub: `${studentPoints.balance} pts` },
  ];
  const journeyCurrent = due.length > 0 ? 2 : meeting ? 1 : 0;

  return (
    <div className="space-y-6">
      {heading}

      {/* ------------------------------------------------ edition hero */}
      <HeroBand border="border-next/30" className="sx-animate">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              {studentEdition.label} · {student.publication}
            </p>
            <Badge tone={closeSoon ? "warn" : "neutral"}>
              closes {studentEdition.closeDate} · {studentEdition.daysToClose} days
            </Badge>
          </div>

          <p className="flex flex-wrap items-baseline gap-2">
            <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
              <CountUp value={salesTotalCents / 100} prefix="$" /> closed
            </span>
            <MiniChip kind="ver">RECORDED BY SPONSORX</MiniChip>
          </p>
          <p className="-mt-2 text-xs text-muted">
            your sales, this edition · attribution is permanent — it stays yours
            after graduation
          </p>

          {/* edition threshold — the whole newsroom's number, not just Jordan's */}
          <div>
            <div className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="text-muted">
                Edition threshold —{" "}
                <span className="font-semibold text-text">
                  {money(studentEdition.committedCents)}
                </span>{" "}
                of {money(studentEdition.thresholdCents)} committed
              </span>
              <span className="tabular-nums text-faint">{editionPct}%</span>
            </div>
            <div className="mt-1.5">
              <Meter value={editionPct} tone="next" />
            </div>
            <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-faint">
              <span>
                <span className="mr-1 inline-block size-1.5 rounded-full bg-next align-middle" />
                {studentEdition.slotsSold} sold
              </span>
              <span>
                <span className="mr-1 inline-block size-1.5 rounded-full bg-next/40 align-middle" />
                {studentEdition.slotsReserved} reserved
              </span>
              <span>
                <span className="mr-1 inline-block size-1.5 rounded-full bg-surface-2 align-middle" />
                {slotsOpen} open
              </span>
            </p>
          </div>
        </div>
      </HeroBand>

      {/* ------------------------------------ the loop (teaching element) */}
      <JourneyStrip steps={journeySteps} current={journeyCurrent} />

      {/* ------------------------------------------------- stat tile row */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Link href="/next/sales" className="group block">
          <Card className="p-3.5 transition-colors group-hover:bg-surface-2/70">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Closed sales
            </p>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="shrink-0 text-lg font-semibold tabular-nums tracking-tight">
                {money(salesTotalCents)}
              </span>
              <div className="min-w-0 flex-1">
                <Sparkline points={studentSalesTrend} stroke="var(--sx-next)" />
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/next/sales" className="group block">
          <Card className="p-3.5 transition-colors group-hover:bg-surface-2/70">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Pipeline
            </p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-semibold tabular-nums tracking-tight">
                {pipeline.length}
              </span>
              <span className="truncate text-[11px] text-faint">
                {meeting ? `next: ${meeting.business}` : "prospects in play"}
              </span>
            </p>
          </Card>
        </Link>
        <Link href="/next/assignments" className="group block">
          <Card className="p-3.5 transition-colors group-hover:bg-surface-2/70">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Assignments due
            </p>
            <p className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-semibold tabular-nums tracking-tight">
                {due.length}
              </span>
              <span className="truncate text-[11px] text-faint">
                next: {due[0]?.due ?? "—"}
              </span>
            </p>
          </Card>
        </Link>
        {/* Points — deliberately unlike money (spec §5.5): violet, "pts"
           spelled out, no $ anywhere in this tile. */}
        <Link href="/next/points" className="group block">
        <Card className="p-3.5 transition-colors group-hover:bg-surface-2/70">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Points
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums tracking-tight text-next">
              {studentPoints.balance}
            </span>
            <span className="text-[11px] font-medium text-next/80">pts</span>
          </p>
          <p className="mt-1 text-[10px] leading-snug text-faint">
            recognition, not pay — points never convert on this page
          </p>
        </Card>
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ================================================== the queue */}
        <section className="sx-animate sx-delay-1 min-w-0">
          <SectionHeading
            title="Up next"
            hint="Everything waiting on you, in order"
          />
          <div className="space-y-3">
            {meeting && (
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {meeting.business} — {PROSPECT_COPY[meeting.stage].toLowerCase()}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{meeting.note}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="warn">this week</Badge>
                  <Button variant="secondary" href="/next/sales">
                    Prep the pitch
                  </Button>
                </div>
              </Card>
            )}

            {due.map((a, i) => (
              <Card
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {a.section} · +{a.points} pts on approval
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={i === 0 ? "warn" : "neutral"}>due {a.due}</Badge>
                  <Button
                    variant="secondary"
                    href={`/next/assignments?open=${a.id}`}
                  >
                    View brief
                  </Button>
                </div>
              </Card>
            ))}

            {submitted && (
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {submitted.business} — with SponsorX
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Acceptance check running (category rules, school
                    exclusivities). Nothing for you to do — you&rsquo;ll keep
                    your credit either way.
                  </p>
                </div>
                <Badge tone="primary">in review</Badge>
              </Card>
            )}

            <Card className="flex flex-wrap items-center justify-between gap-3 border-next/30">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  Pitching this week? Take your code.
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Any sale that mentions{" "}
                  <span className="font-semibold text-next">
                    {student.salesCode}
                  </span>{" "}
                  is credited to you when it closes.
                </p>
              </div>
              <Button variant="secondary" href="/next/code">
                Show my code
              </Button>
            </Card>
          </div>
        </section>

        {/* ======================================================= rail */}
        {/* min-w-0: below xl the grid track is implicit `auto`, whose minimum
           is this item's min-content — and the truncate rows inside are
           nowrap, so a long title would widen the page (found at 390px). */}
        <div className="min-w-0 space-y-6">
          <section className="sx-animate sx-delay-2">
            <SectionHeading title="Points" hint="recognition, never pay" />
            <Card>
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-next">
                  {studentPoints.balance}
                </span>
                <span className="text-[11px] font-medium text-next/80">pts</span>
              </p>
              <ul className="mt-3 space-y-2 border-t border-line-soft pt-3">
                {studentPoints.accruals.slice(0, 3).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-baseline justify-between gap-3 text-xs"
                  >
                    <span className="min-w-0 truncate text-muted">{p.label}</span>
                    <span className="shrink-0 tabular-nums font-medium text-next">
                      +{p.points}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[10px] leading-snug text-faint">
                Points are recognition for published work and closed sales.
                They are not dollars and never appear beside them.
              </p>
            </Card>
          </section>

          <section className="sx-animate sx-delay-3">
            <SectionHeading title="In review" />
            <Card>
              {inFlight.length === 0 ? (
                <p className="text-xs text-muted">Nothing waiting on others.</p>
              ) : (
                <ul className="space-y-2.5">
                  {inFlight.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-xs">{a.title}</span>
                      <Badge tone="primary">
                        {STUDENT_ASSIGNMENT_COPY[a.state]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3">
                <Button variant="secondary" href="/next/assignments" full>
                  All assignments
                </Button>
              </div>
            </Card>
          </section>

          <section className="sx-animate sx-delay-4">
            <SectionHeading title="Your advisor" />
            <Card>
              <p className="text-xs">{student.advisor}</p>
              <p className="mt-1 text-[11px] text-muted">
                Reviews drafts, approves what prints, and signs off school
                content before SponsorX does.
              </p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  full
                  disabled
                  title="Messaging is not in Phase 1 — talk to your advisor in the newsroom"
                >
                  Message advisor
                </Button>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
