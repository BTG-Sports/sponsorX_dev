import { Badge, Card, SectionHeading } from "@/components/ui";
import { ApprovalsDesk } from "@/components/approvals-desk";
import { AssignForm, DraftFileButton, ReviewDecision } from "@/components/advisor-review";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { apiFetch, fetchActor } from "@/server/api";
import { advisorContentQueue, student, studentEdition } from "@/lib/fixtures";
import {
  KIND_WORDS,
  OPEN_EDITION_STATES,
  REVIEW_TABS,
  reviewTab,
  shortDate,
  stageBadge,
  type ApiAssignment,
  type ApiAssignmentList,
} from "@/lib/student-assignments-live";

/* --------------------------------------------------------------------------
   Advisor content review (P1-FE-20, spec §3, §7). ApprovalsDesk reused
   unchanged — the acceptance's whole point: DeliverableState is already an
   editorial workflow (drafted, read by the advisor, seen by the sponsor where
   one paid for a feature, approved, printed, confirmed), so the school's
   queue is the same machine with school words around it. The rows are the
   advisorContentQueue fixture; Jordan's mirror studentAssignments exactly.

   LIVE (P9-FE-12, on P9-BE-24). A signed-in advisor gets LiveReview below:
   three tabs (waiting for you, with the student, approved) with counts, a
   piece opened with ?open=<id> — its brief, the draft's words and file —
   and the decision: approve (it joins the edition) or send back with a
   note. "Assign a piece" gives an active student work for an edition that
   isn't in production yet. Every write is the API's to allow or refuse.
   -------------------------------------------------------------------------- */

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

async function readJson<T>(path: string): Promise<T> {
  /* No catch — an outage is an error page, never fixtures dressed as the real queue. */
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${path.split("?")[0]} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

async function LiveReview({ sp }: { sp: Params }) {
  const tab = reviewTab(sp.tab);
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);
  const openId = one(sp.open);
  const [list, students, editions, opened] = await Promise.all([
    readJson<ApiAssignmentList>(`/student-assignments?view=${tab}&page=${page}&size=20`),
    readJson<{ students: { id: string; displayName: string; state: string }[] }>("/students"),
    readJson<{ editions: { id: string; label: string; state: string; publication: { name: string } }[] }>("/editions"),
    openId ? apiFetch(`/student-assignments/${encodeURIComponent(openId)}`).then(async (r) => (r.ok ? ((await r.json()) as ApiAssignment) : null)) : Promise.resolve(null),
  ]);
  const href = (q: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "" && !(k === "tab" && v === "waiting") && !(k === "page" && v === 1)) u.set(k, String(v));
    const s = u.toString();
    return `/advisor/review${s ? `?${s}` : ""}`;
  };
  const openEditions = editions.editions.filter((e) => OPEN_EDITION_STATES.includes(e.state)).map((e) => ({ id: e.id, label: `${e.label} · ${e.publication.name}` }));
  const activeStudents = students.students.filter((s) => s.state === "ACTIVE").map((s) => ({ id: s.id, label: s.displayName }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Content review</h1>
        <p className="mt-1 text-xs text-muted">What your students make for the edition passes this desk first. You approve it, or send it back with a note.</p>
      </div>

      <nav aria-label="Content review tabs" className="flex flex-wrap gap-2">
        {REVIEW_TABS.map((t) => (
          <a key={t.key} href={href({ tab: t.key })} aria-current={t.key === tab ? "page" : undefined}
            className={["inline-flex min-h-9 items-center gap-2 rounded-full border px-3.5 text-xs", t.key === tab ? "border-next/50 bg-next/12 text-text" : "border-line text-muted hover:text-text"].join(" ")}>
            {t.label} <span className="tabular-nums text-faint">{list.counts[t.key]}</span>
          </a>
        ))}
      </nav>

      {opened && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">{opened.title}</h2>
              <p className="mt-1 text-xs text-muted">
                {KIND_WORDS[opened.kind]} · {opened.student.displayName} · {opened.edition.label}{opened.section ? ` · ${opened.section}` : ""} · due {shortDate(opened.dueAt)}
              </p>
            </div>
            <Badge tone={stageBadge(opened.stage).tone}>{stageBadge(opened.stage).label}</Badge>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted">The brief</p>
            <p className="mt-1 whitespace-pre-line text-xs leading-relaxed">{opened.brief}</p>
          </div>
          {opened.version > 0 && (
            <div>
              <p className="text-[11px] font-medium text-muted">The draft · version {opened.version}{opened.submittedAt ? ` · sent ${shortDate(opened.submittedAt)}` : ""}</p>
              {opened.draftText ? (
                <p className="mt-1 max-h-96 overflow-y-auto whitespace-pre-line rounded-lg border border-line-soft bg-surface-2/60 p-3 text-xs leading-relaxed">{opened.draftText}</p>
              ) : (
                <p className="mt-1 text-xs text-muted">No words — the piece is the file.</p>
              )}
              {opened.hasFile && <div className="mt-2"><DraftFileButton id={opened.id} /></div>}
            </div>
          )}
          {opened.revisionNote && (
            <p role="note" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs">
              <span className="font-medium">You asked for changes:</span> {opened.revisionNote}
            </p>
          )}
          {(opened.stage === "WAITING_FOR_ADVISOR" || opened.stage === "IN_REVIEW") && <ReviewDecision id={opened.id} title={opened.title} />}
          {opened.stage === "APPROVED" && <p className="text-xs text-accent">Approved {shortDate(opened.approvedAt)} — it&apos;s one of the edition&apos;s content items.</p>}
          <a href={href({ tab, page })} className="inline-block text-xs text-muted underline">Close</a>
        </Card>
      )}

      <section>
        <SectionHeading title={REVIEW_TABS.find((t) => t.key === tab)!.label} hint="Oldest submission first" />
        {list.assignments.length === 0 ? (
          <EmptyState
            mark="chart"
            title={tab === "waiting" ? "Nothing waiting for you" : tab === "approved" ? "Nothing approved yet" : "Nothing with your students"}
            hint={tab === "waiting" ? "Drafts land here as soon as a student submits one." : "Assign a piece below and it shows here."}
          />
        ) : (
          <ul className="divide-y divide-line-soft rounded-xl border border-line-soft">
            {list.assignments.map((a) => (
              <li key={a.id}>
                <a href={href({ tab, page, open: a.id })} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2/60">
                  <span>
                    <span className="block text-sm font-medium">{a.title}</span>
                    <span className="block text-[11px] text-muted">{KIND_WORDS[a.kind]} · {a.student.displayName} · {a.edition.label} · {a.submittedAt ? `sent ${shortDate(a.submittedAt)}` : `due ${shortDate(a.dueAt)}`}</span>
                  </span>
                  <Badge tone={stageBadge(a.stage).tone}>{stageBadge(a.stage).label}</Badge>
                </a>
              </li>
            ))}
          </ul>
        )}
        {list.page && list.page.pages > 1 && (
          <p className="mt-3 flex items-center gap-3 text-xs text-muted">
            {list.page.page > 1 && <a className="underline" href={href({ tab, page: list.page.page - 1 })}>Previous</a>}
            <span>Page {list.page.page} of {list.page.pages}</span>
            {list.page.page < list.page.pages && <a className="underline" href={href({ tab, page: list.page.page + 1 })}>Next</a>}
          </p>
        )}
      </section>

      <section>
        <SectionHeading title="Assign a piece" hint="An active student, an edition not yet in production" />
        <Card>
          <AssignForm editions={openEditions} students={activeStudents} />
        </Card>
      </section>
    </div>
  );
}

export default async function AdvisorReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Content review</h1>
      <p className="mt-1 text-xs text-muted">
        {student.publication} · {studentEdition.label} · what the school
        publishes passes this desk first
      </p>
    </div>
  );

  /* P9-FE-12 — a signed-in advisor reviews their school's real student
     content (GET /student-assignments, own school) and assigns new pieces;
     the fixture queue stays for ?demo= and signed-out visitors. */
  if (!demo) {
    const who = await fetchActor();
    if (who.status === "linked" && who.actor.roles.includes("ADVISOR")) {
      return <LiveReview sp={await searchParams} />;
    }
  }

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="Nothing waiting"
          hint="Student drafts land here when they submit from the portal."
        />
      </div>
    );
  }

  const sp = await searchParams;

  return (
    <div className="space-y-5">
      {heading}

      <section className="sx-animate">
        <SectionHeading
          title="The queue"
          hint="Sections filter like campaigns; a paid feature shows its sponsor"
        />
        <ApprovalsDesk
          items={advisorContentQueue}
          demoParam={one(sp.demo) || undefined}
          initial={{
            tab: one(sp.tab),
            q: one(sp.q),
            camp: one(sp.camp),
            kind: one(sp.kind),
            sort: one(sp.sort),
            page: one(sp.page),
            size: one(sp.size),
          }}
        />
      </section>

      <p className="sx-animate sx-delay-1 text-[10px] leading-relaxed text-faint">
        The advisor approves school-specific content and student participation;
        publishing economics and rights decisions stay with SponsorX. A sponsor previewing a paid feature sees placement only — never
        edits copy.
      </p>
    </div>
  );
}
