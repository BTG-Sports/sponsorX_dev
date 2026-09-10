import Link from "next/link";
import { Badge, Button, Card, Meter } from "@/components/ui";
import { FunnelSteps, HBarList } from "@/components/charts";
import { MiniChip } from "@/components/hero";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  APPLICATION_COPY,
  adminPipeline,
  applications,
  type ApplicationState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Athlete Network Manager Workspace — application review, §10 · §23 · §14.

   The queue the Network Manager works: review a submitted application, read
   the Content Value Score factor snapshot, check social verification,
   restrictions/conflicts and (for minors) guardian verification, then approve
   into the network. Approval is what confirms the rate card downstream (B2).

   §14: the score is rules-based in Phase 1 (`method: "rules-v1"`) and stored
   as a factor snapshot so it can be explained after the fact — not a black-box
   number. Approval and rejection are the wireable transitions (B1); shown here
   on fixtures.
   -------------------------------------------------------------------------- */

const STATE_TONE: Record<ApplicationState, "primary" | "warn" | "accent" | "danger"> = {
  SUBMITTED: "primary",
  UNDER_REVIEW: "warn",
  APPROVED: "accent",
  REJECTED: "danger",
};

export default async function AdminApplicationsPage({
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
        Athlete applications
      </h1>
      <p className="mt-1 text-xs text-muted">
        §11 funnel DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → ACTIVE.
        Approval confirms the rate card (B2).
      </p>
    </div>
  );

  if (demo === "empty") {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="users"
          title="No applications in the queue"
          hint="New athlete applications land here from the public join page."
          action={{ label: "View join page", href: "/join" }}
        />
      </div>
    );
  }

  const queue = applications.filter(
    (a) => a.state === "SUBMITTED" || a.state === "UNDER_REVIEW",
  );

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline */}
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Athlete applications
        </h1>
        <p className="mt-1 text-xs text-muted">
          {queue.length} awaiting review · §11 funnel DRAFT → SUBMITTED →
          UNDER_REVIEW → APPROVED → ACTIVE. Approval confirms the rate card (B2).
        </p>
      </div>

      {/* -------------------------------------------------------- pipeline */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="sx-animate sx-delay-1 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Pipeline · this quarter
          </p>
          <div className="mt-3">
            <FunnelSteps stages={adminPipeline.stages} />
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[10px] text-faint">
            count Athlete by state <MiniChip kind="ver">POSTGRES</MiniChip>
          </p>
        </Card>

        <Card className="sx-animate sx-delay-2 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Quality · score distribution
          </p>
          <div className="mt-3">
            <HBarList rows={adminPipeline.scoreBands} />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="text-muted">Median review</span>
            <span className="font-semibold text-text">
              {adminPipeline.medianReviewHours}h
            </span>
            <span className="text-muted">· Approval rate</span>
            <span className="font-semibold text-text">
              {adminPipeline.approvalRatePct}%
            </span>
            <MiniChip kind="ver">POSTGRES</MiniChip>
          </p>
        </Card>
      </div>

      {/* ----------------------------------------------------------- list */}
      <div className="space-y-4">
        {applications.map((a) => (
          <Card key={a.id}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
              {/* ------------------------------------------- applicant */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/athletes/${a.slug}?from=applications`}
                    className="text-sm font-semibold tracking-tight hover:text-accent"
                  >
                    {a.name}
                  </Link>
                  <Badge tone={STATE_TONE[a.state]}>
                    {APPLICATION_COPY[a.state]}
                  </Badge>
                  {a.isMinor && <Badge tone="warn">Minor · §4</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {a.sport} · {a.region} · {a.followers.toLocaleString()}{" "}
                  followers · submitted {a.submittedAt}
                </p>

                {a.flags.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {a.flags.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2 text-[11px] text-danger"
                      >
                        <span aria-hidden="true">▲</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {a.isMinor && (
                  <div className="mt-3 flex items-center gap-2 text-[11px]">
                    <span className="text-faint">Guardian</span>
                    {a.guardianVerified ? (
                      <Badge tone="accent">Verified</Badge>
                    ) : (
                      <Badge tone="warn">Verification pending</Badge>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    disabled={a.isMinor && !a.guardianVerified}
                    title={
                      a.isMinor && !a.guardianVerified
                        ? "Blocked: a minor needs a verified guardian before approval (§4)"
                        : "Approve into the network — not wired (B1)"
                    }
                  >
                    Approve
                  </Button>
                  <Button variant="secondary" title="Request changes — not wired">
                    Request info
                  </Button>
                  <Button variant="ghost" title="Reject — not wired">
                    Reject
                  </Button>
                </div>
              </div>

              {/* ------------------------------------- score snapshot */}
              <div className="rounded-xl border border-line bg-surface-2 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Content Value Score
                  </span>
                  <span className="text-xl font-semibold tabular-nums">
                    {a.score.total}
                  </span>
                </div>
                <ul className="mt-3 space-y-2">
                  {a.score.factors.map((f) => (
                    <li key={f.label}>
                      <div className="flex items-baseline justify-between text-[11px]">
                        <span className="text-muted">{f.label}</span>
                        <span className="tabular-nums text-faint">{f.value}</span>
                      </div>
                      <div className="mt-1">
                        <Meter value={f.value} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[10px] leading-relaxed text-faint">
                  method{" "}
                  <code className="font-mono">{a.score.method}</code> · §14.
                  Rules-based in Phase 1; algorithmic scoring is Phase 3.
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-faint">
        The compliance checklist here gates §37&rsquo;s pre-pilot gate: an
        athlete cannot go ACTIVE with an unverified guardian or an unresolved
        category conflict (§26).
      </p>
    </div>
  );
}
