import { Badge, Card, SectionHeading } from "@/components/ui";
import { HeroBand, MiniChip } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { StudentDecision } from "@/components/student-review";
import { ClaimDecision } from "@/components/claim-decision";
import { STUDENT_STATE_COPY, groupStudents, type ApiStudent, type ApiStudentState } from "@/lib/students-live";

/* --------------------------------------------------------------------------
   P9-FE-02 — the advisor desk on real Student records (GET /students).
   The matrix scopes the list to the advisor's own school (own-property);
   another school's student is not here, and a decision on one is refused
   by the API. Decisions are POST /students/:id/transition.
   -------------------------------------------------------------------------- */

const TONE: Partial<Record<ApiStudentState, "warn" | "primary" | "accent" | "neutral" | "danger">> = {
  SUBMITTED: "warn",
  UNDER_REVIEW: "primary",
  CHANGES_REQUESTED: "neutral",
  APPROVED: "accent",
  ACTIVE: "accent",
  SUSPENDED: "danger",
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function StudentCard({ s }: { s: ApiStudent }) {
  return (
    <Card className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {s.displayName}
          {s.displayName !== s.legalName && <span className="text-[11px] font-normal text-faint">({s.legalName})</span>}
          {s.gradYear && <span className="text-[11px] font-normal text-faint">Class of {s.gradYear}</span>}
          {s.masthead.map((m) => (
            <Badge key={m} tone="primary">
              {m.toLowerCase()}
            </Badge>
          ))}
        </p>
        {s.reviewerNotes && <p className="mt-1 text-xs leading-relaxed text-muted">Note: {s.reviewerNotes}</p>}
        <p className="mt-1 text-[10px] text-faint">
          applied {fmt(s.createdAt)}
          {s.guardianId ? " · guardian linked" : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Badge tone={TONE[s.state] ?? "neutral"}>{STUDENT_STATE_COPY[s.state]}</Badge>
        <StudentDecision studentId={s.id} state={s.state} />
      </div>
    </Card>
  );
}

export type ApiClaim = {
  id: string;
  athleteId: string;
  claimantName: string;
  claimantEmail: string;
  rosterMatched: boolean;
  state: "SUBMITTED" | "VERIFIED" | "REJECTED";
  createdAt: string;
  athlete: { displayName: string; slug: string; sport: string; state: string } | null;
};

/** P9-FE-08 — "that's me" claims on featured profiles at this school. */
function ClaimsSection({ claims }: { claims: ApiClaim[] }) {
  const open = claims.filter((c) => c.state === "SUBMITTED");
  if (claims.length === 0) return null;
  return (
    <section className="sx-animate sx-delay-1">
      <SectionHeading title={`Profile claims · ${open.length}`} hint="Step two of three: you confirm the claimant is your student. It never represents or activates anyone." />
      <div className="space-y-3">
        {claims.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-medium">
                {c.claimantName} <span className="font-normal text-muted">claims</span> {c.athlete?.displayName ?? "a featured profile"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {c.athlete?.sport ? `${c.athlete.sport} · ` : ""}
                {c.claimantEmail} · {fmt(c.createdAt)}
              </p>
              <p className="mt-1.5">
                <Badge tone={c.rosterMatched ? "accent" : "warn"}>{c.rosterMatched ? "on your roster" : "not on your roster"}</Badge>
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Badge tone={c.state === "SUBMITTED" ? "warn" : c.state === "VERIFIED" ? "accent" : "neutral"}>{c.state.toLowerCase()}</Badge>
              {c.state === "SUBMITTED" && <ClaimDecision claimId={c.id} rosterMatched={c.rosterMatched} />}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

export function LiveAdvisorDesk({ students, claims = [] }: { students: ApiStudent[]; claims?: ApiClaim[] }) {
  const g = groupStudents(students);
  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Student applications</h1>
      <p className="mt-1 text-xs text-muted">Your school&rsquo;s applicants and masthead — nobody else&rsquo;s.</p>
    </div>
  );
  if (students.length === 0) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="chart" title="No applications yet" hint="Students apply from the public Become the Media page; new ones land here." />
        <ClaimsSection claims={claims} />
      </div>
    );
  }
  const sections: Array<{ key: string; title: string; hint: string; items: ApiStudent[] }> = [
    { key: "waiting", title: "Waiting on you", hint: "Start a review, then approve, ask for changes or decline", items: g.waiting },
    { key: "approved", title: "Approved — not yet on the masthead", hint: "A minor joins once a guardian is verified", items: g.approved },
    { key: "with", title: "With the student", hint: "Changes requested — they resubmit", items: g.withStudent },
    { key: "roster", title: "On the masthead", hint: "Active students", items: g.roster },
    { key: "closed", title: "Closed", hint: "Declined or left", items: g.closed },
  ].filter((x) => x.items.length > 0);

  return (
    <div className="space-y-6">
      {heading}
      <HeroBand border="border-next/30" className="sx-animate">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Waiting on you</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent">
                {g.waiting.length}
              </span>
              <span className="text-sm text-muted">{g.waiting.length === 1 ? "application" : "applications"}</span>
            </p>
          </div>
          <p className="max-w-md text-xs leading-relaxed text-muted">
            You approve who joins the masthead. Publishing economics and rights stay with SponsorX — never on this desk.
          </p>
        </div>
      </HeroBand>
      <ClaimsSection claims={claims} />
      {sections.map((sec) => (
        <section key={sec.key} className="sx-animate sx-delay-1">
          <SectionHeading title={`${sec.title} · ${sec.items.length}`} hint={sec.hint} />
          <div className="space-y-3">
            {sec.items.map((s) => (
              <StudentCard key={s.id} s={s} />
            ))}
          </div>
        </section>
      ))}
      <p className="flex items-center gap-1.5 text-[10px] text-faint">
        Student records, scoped to your school <MiniChip kind="ver">POSTGRES</MiniChip>
      </p>
    </div>
  );
}
