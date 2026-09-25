import { SectionHeading } from "@/components/ui";
import { ApprovalsDesk } from "@/components/approvals-desk";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { advisorContentQueue, student, studentEdition } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Advisor content review (P1-FE-20, spec §3, §7). ApprovalsDesk reused
   unchanged — the acceptance's whole point: DeliverableState is already an
   editorial workflow (drafted, read by the advisor, seen by the sponsor where
   one paid for a feature, approved, printed, confirmed), so the school's
   queue is the same machine with school words around it. The rows are the
   advisorContentQueue fixture; Jordan's mirror studentAssignments exactly.
   -------------------------------------------------------------------------- */

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
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

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
        publishing economics and rights decisions stay with SponsorX (NEXT spec
        §5.2). A sponsor previewing a paid feature sees placement only — never
        edits copy.
      </p>
    </div>
  );
}
