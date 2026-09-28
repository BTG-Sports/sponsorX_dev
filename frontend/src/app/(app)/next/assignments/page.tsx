import { Badge } from "@/components/ui";
import { SkeletonPage, EmptyState } from "@/components/states";
import {
  StudentAssignments,
  type AssignmentRow,
} from "@/components/student-assignments";
import { demoState } from "@/lib/demo";
import { liveStudent } from "../live";
import { LiveAssignmentsNotice, StudentUnlinked } from "../live-views";
import { student, studentAssignments, studentEdition } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Assignments — the student's editorial desk (P1-FE-19). The list is a client
   island (instant filters, brief drawer); this page derives the serializable
   rows and owns the header. Due dates read against the edition close because
   that is the deadline that actually matters in a newsroom.
   -------------------------------------------------------------------------- */

export default async function StudentAssignmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  /* P9-FE-01 — no editorial-assignment model exists in the backend yet; a
     signed-in student is told so instead of seeing fixture assignments. */
  if (!demo) {
    const live = await liveStudent();
    if (live?.kind === "unlinked") return <StudentUnlinked title="Assignments" />;
    if (live) return <LiveAssignmentsNotice />;
  }

  const sp = await searchParams;
  const initialFilter = typeof sp.f === "string" ? sp.f : undefined;
  const initialOpen = typeof sp.open === "string" ? sp.open : undefined;

  const heading = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Assignments</h1>
        <p className="mt-1 text-xs text-muted">
          {student.publication} · {studentEdition.label}
        </p>
      </div>
      <Badge tone={studentEdition.daysToClose <= 7 ? "warn" : "neutral"}>
        edition closes {studentEdition.closeDate}
      </Badge>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="chart"
          title="No assignments yet"
          hint="Your advisor assigns work from the edition plan. Check back after the pitch meeting."
        />
      </div>
    );
  }

  const rows: AssignmentRow[] = studentAssignments.map((a) => ({
    id: a.id,
    kind: a.kind,
    title: a.title,
    section: a.section,
    due: a.due,
    state: a.state,
    points: a.points,
    brief: a.brief,
  }));

  return (
    <div className="space-y-5">
      {heading}
      <StudentAssignments
        rows={rows}
        initialFilter={initialFilter}
        initialOpen={initialOpen}
      />
    </div>
  );
}
