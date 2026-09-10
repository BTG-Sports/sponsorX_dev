import { Badge, Button, Card, SectionHeading } from "@/components/ui";
import { MiniChip } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  DELIVERABLE_COPY,
  adminApprovalsX,
  contentReviewQueue,
  deliverables,
  type DeliverableState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Content Approval Workspace — §10, deliverable pipeline §21.

   BTG reviews a submitted draft, then the sponsor reviews, then it is approved
   and published. The state machine is the feature:
   NOT_STARTED → DRAFT_SUBMITTED → BTG_REVIEW → SPONSOR_REVIEW → APPROVED →
   PUBLISHED → VERIFIED (§21). Revision requests send a deliverable back a step.

   Creative assets live in the PRIVATE R2 bucket and are only ever reached
   through short-lived signed URLs — never public (guide §11). The preview here
   is a placeholder standing in for that signed fetch.
   -------------------------------------------------------------------------- */

const STATE_TONE: Record<DeliverableState, "neutral" | "primary" | "warn" | "accent"> = {
  NOT_STARTED: "neutral",
  DRAFT_SUBMITTED: "primary",
  BTG_REVIEW: "warn",
  SPONSOR_REVIEW: "warn",
  APPROVED: "accent",
  PUBLISHED: "accent",
  VERIFIED: "accent",
};

/** Whose desk the deliverable is on, given its state. */
function stage(state: DeliverableState): string {
  if (state === "DRAFT_SUBMITTED" || state === "BTG_REVIEW") return "With BTG";
  if (state === "SPONSOR_REVIEW") return "With sponsor";
  return "Cleared";
}

/** The primary action that advances a queued deliverable one step (§21). */
const QUEUE_ACTION: Partial<Record<DeliverableState, string>> = {
  DRAFT_SUBMITTED: "Start BTG review",
  BTG_REVIEW: "Send to sponsor",
  SPONSOR_REVIEW: "Approve & publish",
};

export default async function AdminApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">
        Content approvals
      </h1>
      <p className="mt-1 text-xs text-muted">
        §21 pipeline. Assets are fetched from the private R2 bucket with
        signed URLs (guide §11).
      </p>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="inbox"
          title="Nothing waiting on review"
          hint="Deliverables arrive here when athletes submit content."
        />
      </div>
    );
  }

  const cleared = deliverables.filter(
    (d) => d.state === "APPROVED" || d.state === "PUBLISHED" || d.state === "VERIFIED",
  );

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Content approvals
        </h1>
        <p className="mt-1 text-xs text-muted">
          {contentReviewQueue.length} awaiting a decision · §21 pipeline. Assets
          are fetched from the private R2 bucket with signed URLs (guide §11).
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span className="text-muted">Median turnaround</span>
          <span className="font-semibold text-text">
            {adminApprovalsX.medianTurnaroundHours}h
          </span>
          <span className="text-muted">· Approval rate</span>
          <span className="font-semibold text-text">
            {adminApprovalsX.approvalRatePct}%
          </span>
          <MiniChip kind="neutral">timestamps</MiniChip>
        </p>
      </div>

      {/* --------------------------------------------------------- review */}
      <section>
        <SectionHeading
          title="In review"
          hint="BTG_REVIEW → SPONSOR_REVIEW → APPROVED → PUBLISHED → VERIFIED"
        />
        <div className="space-y-3">
          {contentReviewQueue.map((d) => (
            <Card key={d.id} className="p-4">
              <div className="flex flex-wrap items-start gap-4">
                {/* --------------------------------- asset placeholder */}
                <div className="grid h-16 w-24 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-[10px] text-faint">
                  {d.assetKind === "video" ? "▶ video" : "▦ image"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold tracking-tight">
                      {d.title}
                    </span>
                    <Badge tone="neutral">v{d.version}</Badge>
                    <Badge tone={STATE_TONE[d.state]}>
                      {DELIVERABLE_COPY[d.state]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {d.athlete} · {d.campaign} · {d.sponsor}
                  </p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {stage(d.state)} · due {d.dueDate} · submitted {d.submittedAt}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button title="Advance to the next stage — not wired">
                      {QUEUE_ACTION[d.state] ?? "Review"}
                    </Button>
                    <Button
                      variant="secondary"
                      title="Request a revision — sends the deliverable back a step (not wired)"
                    >
                      Request revision
                    </Button>
                    <Button
                      variant="ghost"
                      title="Open the signed asset URL — not wired"
                    >
                      View asset
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- cleared */}
      <section>
        <SectionHeading title="Recently cleared" />
        <Card className="p-0">
          <ul className="divide-y divide-line-soft">
            {cleared.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{d.title}</p>
                  <p className="truncate text-[11px] text-faint">
                    {d.campaign} · {d.sponsor}
                  </p>
                </div>
                <Badge tone={STATE_TONE[d.state]}>
                  {DELIVERABLE_COPY[d.state]}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <p className="text-[10px] leading-relaxed text-faint">
        Usage-rights expiry is tracked from publication (§21). A PUBLISHED
        deliverable whose rights window closes is flagged for takedown — wired
        in B5 alongside the R2 upload/derive pipeline.
      </p>
    </div>
  );
}
