import { Badge, Card, SectionHeading } from "@/components/ui";
import { HeroBand, MiniChip } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { StudentDecision } from "@/components/student-review";
import { ClaimDecision } from "@/components/claim-decision";
import { ListSearch, PagerRow, PendingList, ServerList } from "@/components/server-pager";
import type { PageInfo } from "@/lib/list-query";
import {
  CLAIM_KEYS,
  STUDENT_GROUPS,
  STUDENT_STATE_COPY,
  type ApiStudent,
  type ApiStudentState,
  type StudentGroup,
  type StudentGroupCounts,
} from "@/lib/students-live";
import { ClaimTabs, GroupTabs } from "./desk-controls";

/* --------------------------------------------------------------------------
   P9-FE-02 — the advisor desk on real Student records (GET /students).
   The matrix scopes the list to the advisor's own school (own-property);
   another school's student is not here, and a decision on one is refused
   by the API. Decisions are POST /students/:id/transition.

   SERVER-PAGED (2026-09-29): the five groups are tabs of ONE list — the
   page asks GET /students?page=&size=&group=&q= for exactly the visible
   page, and the tab counts are the API's groupBy. Claims are a second paged
   list on ?cpage / ?csize / ?cstate, with the open count from the API.
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


export type ClaimsPage = { claims: ApiClaim[]; page: PageInfo; summary: { open: number; all: number } };
export type StudentsPage = { students: ApiStudent[]; page: PageInfo; summary: StudentGroupCounts };

function ClaimCard({ c }: { c: ApiClaim }) {
  return (
    <Card className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-64">
        <p className="break-words text-sm font-medium">
          {c.claimantName} <span className="font-normal text-muted">claims</span> {c.athlete?.displayName ?? "a featured profile"}
        </p>
        <p className="mt-1 break-words text-xs text-muted">
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
  );
}

/** P9-FE-08 — "that's me" claims on featured profiles at this school, as a
 *  second paged list (?cpage / ?csize / ?cstate). */
function ClaimsSection({ claims, cstate }: { claims: ClaimsPage | null; cstate: "" | "open" }) {
  if (!claims || claims.summary.all === 0) return null;
  const { page, summary } = claims;
  return (
    <section className="sx-animate sx-delay-1 min-w-0 space-y-3">
      <SectionHeading title={`Profile claims · ${summary.open}`} hint="Step two of three: you confirm the claimant is your student. It never represents or activates anyone." />
      <ClaimTabs cstate={cstate} open={summary.open} all={summary.all} />
      {page.total === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-5 py-6 text-center text-xs text-muted">No claims waiting on you.</p>
      ) : (
        <>
          <PagerRow page={page} noun="Claims" tone="next" position="top" keys={CLAIM_KEYS} filtered={Boolean(cstate)} />
          <PendingList className="space-y-3">
            {claims.claims.map((c) => (
              <ClaimCard key={c.id} c={c} />
            ))}
          </PendingList>
          <PagerRow page={page} noun="Claims" tone="next" position="bottom" keys={CLAIM_KEYS} filtered={Boolean(cstate)} />
        </>
      )}
    </section>
  );
}

export function LiveAdvisorDesk({
  students,
  claims = null,
  group = "",
  q = "",
  cstate = "",
}: {
  students: StudentsPage;
  claims?: ClaimsPage | null;
  group?: StudentGroup | "";
  q?: string;
  cstate?: "" | "open";
}) {
  const { groups, all } = students.summary;
  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Student applications</h1>
      <p className="mt-1 text-xs text-muted">Your school&rsquo;s applicants and masthead — nobody else&rsquo;s.</p>
    </div>
  );
  if (all === 0 && !q) {
    return (
      <ServerList>
        <div className="space-y-6">
          {heading}
          <EmptyState mark="chart" title="No applications yet" hint="Students apply from the public Become the Media page; new ones land here." />
          <ClaimsSection claims={claims} cstate={cstate} />
        </div>
      </ServerList>
    );
  }
  const sec = STUDENT_GROUPS.find((g) => g.key === group);
  const filtered = Boolean(group || q);

  return (
    <ServerList>
      <div className="space-y-6">
        {heading}
        <HeroBand border="border-next/30" className="sx-animate">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Waiting on you</p>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent">
                  {groups.waiting}
                </span>
                <span className="text-sm text-muted">{groups.waiting === 1 ? "application" : "applications"}</span>
              </p>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-muted">
              You approve who joins the masthead. Publishing economics and rights stay with SponsorX — never on this desk.
            </p>
          </div>
        </HeroBand>
        <ClaimsSection claims={claims} cstate={cstate} />
        <section className="sx-animate sx-delay-1 min-w-0 space-y-3">
          <SectionHeading
            title={`${sec ? sec.title : "All students"} · ${students.page.total}`}
            hint={sec ? sec.hint : "Newest first — pick a group to work one queue"}
          />
          <GroupTabs group={group} counts={groups} all={all} />
          <ListSearch initial={q} label="Search students" placeholder="Search by name" tone="next" />
          {students.page.total === 0 ? (
            <p className="rounded-xl border border-line bg-surface px-5 py-6 text-center text-xs text-muted">
              {q ? "No student matches that name here." : "Nobody in this group right now."}
            </p>
          ) : (
            <>
              <PagerRow page={students.page} noun="Students" tone="next" position="top" filtered={filtered} />
              <PendingList className="space-y-3">
                {students.students.map((s) => (
                  <StudentCard key={s.id} s={s} />
                ))}
              </PendingList>
              <PagerRow page={students.page} noun="Students" tone="next" position="bottom" filtered={filtered} />
            </>
          )}
        </section>
        <p className="flex items-center gap-1.5 text-[10px] text-faint">
          Student records, scoped to your school <MiniChip kind="ver">POSTGRES</MiniChip>
        </p>
      </div>
    </ServerList>
  );
}
