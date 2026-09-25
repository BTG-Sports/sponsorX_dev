import Link from "next/link";
import { Badge, Button, Card, SectionHeading } from "@/components/ui";
import { HeroBand } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  STUDENT_APPLICATION_COPY,
  advisorContentQueue,
  student,
  studentApplications,
  studentEdition,
  type StudentApplicationState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Advisor home — student applications (P1-FE-20, spec §3, §5.1). The advisor
   reviews a student application exactly as a network manager reviews an
   athlete one: same shape of queue, same decision verbs. Decisions ship
   disabled naming P9-FE-02; the review itself — reading the note, knowing the
   kid — happens off-screen in a school hallway, which is why the note is the
   biggest thing on the card.
   -------------------------------------------------------------------------- */

const STATE_TONE: Record<StudentApplicationState, "warn" | "primary" | "accent"> = {
  SUBMITTED: "warn",
  UNDER_REVIEW: "primary",
  APPROVED: "accent",
};

const WIRING_TITLE =
  "Advisor decisions are wired by P9-FE-02 against the Student model (Stage 9 — gated behind B8 and a sold edition)";

export default async function AdvisorHomePage({
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
          Student applications
        </h1>
        <p className="mt-1 text-xs text-muted">
          {student.publication} · {student.school}
        </p>
      </div>
      <Badge tone={studentEdition.daysToClose <= 7 ? "warn" : "neutral"}>
        {studentEdition.label} closes {studentEdition.closeDate}
      </Badge>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No applications waiting"
          hint="Students apply from the public Become the Media page; new ones land here."
        />
      </div>
    );
  }

  const waiting = studentApplications.filter((a) => a.state !== "APPROVED");
  const inReview = advisorContentQueue.filter(
    (c) => c.state === "DRAFT_SUBMITTED",
  ).length;

  return (
    <div className="space-y-6">
      {heading}

      {/* ------------------------------------------------------ hero band */}
      <HeroBand border="border-next/30" className="sx-animate">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Waiting on you
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent">
                {waiting.length}
              </span>
              <span className="text-sm text-muted">
                {waiting.length === 1 ? "application" : "applications"}
              </span>
            </p>
          </div>
          <div className="text-xs text-muted">
            <p>
              <strong className="font-semibold text-text">{inReview}</strong>{" "}
              drafts in the{" "}
              <Link
                href="/advisor/review"
                className="font-medium text-next transition-colors hover:text-next-soft"
              >
                content queue →
              </Link>
            </p>
            <p className="mt-1.5 max-w-md leading-relaxed">
              You approve who joins the masthead and what the school publishes.
              Publishing economics and rights stay with SponsorX — never on
              this desk.
            </p>
          </div>
        </div>
      </HeroBand>

      {/* --------------------------------------------------- applications */}
      <section className="sx-animate sx-delay-1">
        <SectionHeading
          title={`Applications · ${studentApplications.length}`}
          hint="Newest first — the note is the review"
        />
        <div className="space-y-3">
          {studentApplications.map((a) => (
            <Card
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1 basis-64">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {a.name}
                  <span className="text-[11px] font-normal text-faint">
                    Class of {a.gradYear}
                  </span>
                  {a.masthead.map((m) => (
                    <Badge key={m} tone="primary">
                      {m.toLowerCase()}
                    </Badge>
                  ))}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {a.note}
                </p>
                <p className="mt-1 text-[10px] text-faint">
                  applied {a.submitted}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Badge tone={STATE_TONE[a.state]}>
                  {STUDENT_APPLICATION_COPY[a.state]}
                </Badge>
                {a.state !== "APPROVED" && (
                  <div className="flex gap-2">
                    <Button disabled title={WIRING_TITLE}>
                      Approve
                    </Button>
                    <Button variant="secondary" disabled title={WIRING_TITLE}>
                      Request changes
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <p className="sx-animate sx-delay-2 text-[10px] leading-relaxed text-faint">
        A student application mirrors an athlete application deliberately
        (NEXT spec §5.1): same review shape, same audit expectations. School
        email is a signal, never a requirement.
      </p>
    </div>
  );
}
