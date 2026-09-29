import { BlockedNotice, SectionHeading } from "@/components/ui";
import { FunnelSteps } from "@/components/charts";
import { HeroBand, MiniChip } from "@/components/hero";
import { ApplicationsDesk } from "@/components/applications-desk";
import { EmptyState, SkeletonPage } from "@/components/states";
import { demoState } from "@/lib/demo";
import { AGING_HOURS, waitHours } from "@/lib/applications-ui";
import {
  deskApiExtras,
  deskQuery,
  toDeskApp,
  type ApiApplication,
  type ApplicationsSummary,
  type DeskApp,
  type DeskQuery,
} from "@/lib/applications-live";
import { apiListQuery, type PageInfo, type SearchParams } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";
import { adminPipeline, applications } from "@/lib/fixtures";
import { reviewAction } from "./actions";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";

/* --------------------------------------------------------------------------
   Athlete Network Manager Workspace — application review, §10 · §23 · §14.
   Redesigned 2026-09-14 (UX feedback: the old page was a flat card dump —
   every application fully expanded, spec jargon in the copy, dead buttons).

   The page now works like a desk: a hero band answers "how is the queue
   doing" (waiting count, aging alert, funnel, review pace), and the queue
   itself is the ApplicationsDesk client island — tabs, instant search and
   filters, a score ring per row, and a slide-over review drawer where the
   §14 factor snapshot, the §4 guardian gate and the §26 conflict check live.
   Approve / Request info / Reject are the §11 B1 transitions, working
   locally on fixtures ("this visit only") until the backend lands.

   §14: the score is rules-based in Phase 1 (`method: "rules-v1"`) and stored
   as a factor snapshot so it can be explained after the fact — the drawer
   shows exactly that snapshot. Approval confirms the rate card (B2).

   LIVE vs DEMO (P3-FE-02, the marketplace precedent). A signed-in BTG
   reviewer sees the REAL queue — GET /applications, §21 states, the stored
   §14 snapshot — and the drawer's decisions POST through the reviewAction
   server function: begin-review, approve, request-changes, reject, each
   audited and emailed by the API. Anyone else, or any ?demo= state, keeps
   the fixture demo. In live mode the fixture funnel and review-pace stats
   are NOT shown: no endpoint answers them yet, and a real reviewer must not
   read invented statistics beside real applicants (§22).

   SERVER-PAGED (2026-09-29). Live mode no longer fetches the queue to filter
   it in the browser: ?page ?size ?tab ?q ?sport ?flag ?sort are read here,
   sent to GET /applications?page=, and the API answers exactly one page with
   its total; the hero band's numbers and the tab counts come from GET
   /applications/summary, counted in the database. The demo keeps its
   client-side desk.
   -------------------------------------------------------------------------- */

type LiveQueue = {
  rows: DeskApp[];
  page: PageInfo;
  summary: ApplicationsSummary;
  query: DeskQuery;
};

/** One page of the real queue for a signed-in BTG reviewer, or null for the
 *  demo. */
async function liveQueue(sp: SearchParams): Promise<LiveQueue | null> {
  /* No catch — an API outage lands on the error boundary rather than quietly
     downgrading a reviewer to fixtures (the QA pass 4 rule). Anonymous and
     unprovisioned visitors never hit the queue and keep the demo. */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  const mayReview = who.actor.roles.some(
    (r) => r === "BTG_ADMIN" || r === "NETWORK_MGR" || r === "SUPER_ADMIN",
  );
  if (!mayReview) return null;

  const query = deskQuery(sp);
  const [res, sum] = await Promise.all([
    apiFetch(`/applications${apiListQuery(sp, deskApiExtras(query))}`),
    apiFetch("/applications/summary"),
  ]);
  if (!res.ok) throw new Error(`Review queue unavailable (${res.status}).`);
  if (!sum.ok) throw new Error(`Review queue summary unavailable (${sum.status}).`);
  const data = (await res.json()) as {
    applications: ApiApplication[];
    page: PageInfo;
  };
  const { summary } = (await sum.json()) as { summary: ApplicationsSummary };
  const now = new Date();
  return {
    rows: data.applications.map((row) => toDeskApp(row, now)),
    page: data.page,
    summary,
    query,
  };
}

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");
  /* C-1: a staff role this desk isn't for gets "not in your role", not the
     sample desk. The demo stays for ?demo= and signed-out visitors. */
  if (demo === null) {
    const lacking = await staffWithoutAccess("/admin/applications");
    if (lacking) return <NotInRole path="/admin/applications" title="Applications" roles={lacking} />;
  }

  const sp = await searchParams;
  const live = demo === null ? await liveQueue(sp) : null;

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">
        Athlete applications
      </h1>
      <p className="mt-1 text-xs text-muted">
        Review new athletes, check the score and safeguards, and approve them
        into the network.
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

  // Demo: seed the desk's tabs and filters from the URL so a filtered queue
  // is shareable; the island clamps stale values and keeps the URL in sync.
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  /* ------------------------------------------------------------- live mode */
  if (live) {
    /* Empty means the whole scope is empty (the summary's total), not this
       page — a filtered-to-nothing page keeps the desk and its "Clear all". */
    if (live.summary.total === 0) {
      return (
        <div className="space-y-6">
          {heading}
          <EmptyState
            mark="users"
            title="No applications yet"
            hint="New athlete applications land here from the public join page."
            action={{ label: "View join page", href: "/join" }}
          />
        </div>
      );
    }

    const { waiting: liveWaiting, overdue: liveOverdue, decided, total } =
      live.summary;

    return (
      <div className="space-y-6">
        {heading}

        {/* Real numbers only — the fixture funnel and review-pace stats have
            no endpoint yet, and invented statistics don't belong beside real
            applicants (§22). */}
        <HeroBand border="border-admin/25" className="sx-animate">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
            Review queue
          </p>
          <p className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
              {liveWaiting}
            </span>
            <span className="text-sm text-muted">
              {liveWaiting === 1 ? "athlete" : "athletes"} waiting
            </span>
            <MiniChip kind="ver">POSTGRES</MiniChip>
          </p>
          <div className="mt-4 space-y-2.5 text-xs text-muted">
            {liveOverdue > 0 ? (
              <p className="flex items-center gap-2">
                <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
                  <span className="sx-viz-pulse absolute inset-0 rounded-full bg-warn" />
                  <span className="relative inline-flex size-2 rounded-full bg-warn" />
                </span>
                <span>
                  <strong className="font-semibold text-text">
                    {liveOverdue}
                  </strong>{" "}
                  waiting over 48 hours — the queue below puts them first
                </span>
              </p>
            ) : (
              <p className="flex items-center gap-2">
                <span
                  className="inline-flex size-2 shrink-0 rounded-full bg-success"
                  aria-hidden="true"
                />
                <span>Queue is fresh — nothing waiting over 48 hours</span>
              </p>
            )}
            <p>
              {total} {total === 1 ? "application" : "applications"} on file
              · {decided} decided
            </p>
          </div>
        </HeroBand>

        <section className="sx-animate sx-delay-1">
          <SectionHeading
            title="The queue"
            hint="Click an application to review it — search and filters apply instantly."
          />
          <ApplicationsDesk
            items={live.rows}
            live={{
              act: reviewAction,
              page: live.page,
              summary: live.summary,
              query: live.query,
            }}
          />
        </section>

        <p className="sx-animate sx-delay-2 text-[10px] leading-relaxed text-faint">
          An athlete cannot go live with an unverified guardian — approval
          passes review; activation is the separate step that lets them take
          paid work.
        </p>
      </div>
    );
  }

  /* ------------------------------------------------------------- demo mode */
  const waiting = applications.filter(
    (a) => a.state === "SUBMITTED" || a.state === "UNDER_REVIEW",
  );
  const overdue = waiting.filter((a) => waitHours(a.submittedAt) > AGING_HOURS);

  return (
    <div className="space-y-6">
      {/* -------------------------------------------------------- headline */}
      {heading}

      {/* P7-QA-02: this fixture branch also reaches signed-in staff who may
          not review (SALES, CAMPAIGN_MGR, FINANCE) — its POSTGRES-chipped
          median / approval rate / funnel are sample data. */}
      {demo === null && (
        <BlockedNotice>
          Demo data — the live review queue is read by BTG admin and the
          Network Manager, so every figure below is sample data.
        </BlockedNotice>
      )}

      {/* ------------------------------------------------------- hero band */}
      <HeroBand border="border-admin/25" className="sx-animate">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Review queue
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="bg-[linear-gradient(90deg,var(--sx-admin),var(--sx-primary))] bg-clip-text text-4xl font-bold tabular-nums tracking-tight text-transparent sm:text-5xl">
                {waiting.length}
              </span>
              <span className="text-sm text-muted">
                {waiting.length === 1 ? "athlete" : "athletes"} waiting
              </span>
              <MiniChip kind="ver">POSTGRES</MiniChip>
            </p>

            <div className="mt-4 space-y-2.5 text-xs text-muted">
              {overdue.length > 0 ? (
                <p className="flex items-center gap-2">
                  <span className="relative inline-flex size-2 shrink-0" aria-hidden="true">
                    <span className="sx-viz-pulse absolute inset-0 rounded-full bg-warn" />
                    <span className="relative inline-flex size-2 rounded-full bg-warn" />
                  </span>
                  <span>
                    <strong className="font-semibold text-text">
                      {overdue.length}
                    </strong>{" "}
                    waiting over 48 hours — the queue below puts them first
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2">
                  <span
                    className="inline-flex size-2 shrink-0 rounded-full bg-success"
                    aria-hidden="true"
                  />
                  <span>Queue is fresh — nothing waiting over 48 hours</span>
                </p>
              )}
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                Median review
                <strong className="font-semibold text-text">
                  {adminPipeline.medianReviewHours}h
                </strong>
                · approval rate
                <strong className="font-semibold text-text">
                  {adminPipeline.approvalRatePct}%
                </strong>
                <MiniChip kind="ver">POSTGRES</MiniChip>
              </p>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Pipeline · this quarter
            </p>
            <div className="mt-2">
              <FunnelSteps stages={adminPipeline.stages} />
            </div>
          </div>
        </div>
      </HeroBand>

      {/* ----------------------------------------------------------- desk */}
      <section className="sx-animate sx-delay-1">
        <SectionHeading
          title="The queue"
          hint="Click an application to review it — search and filters apply instantly."
        />
        <ApplicationsDesk
          items={applications}
          demoParam={one(sp.demo) || undefined}
          initial={{
            tab: one(sp.tab),
            q: one(sp.q),
            sport: one(sp.sport),
            flag: one(sp.flag),
            sort: one(sp.sort),
          }}
        />
      </section>

      {/* ------------------------------------------------------ trust note */}
      <p className="sx-animate sx-delay-2 text-[10px] leading-relaxed text-faint">
        An athlete cannot go live with an unverified guardian or an unresolved
        category conflict — approval is also what confirms their rate card
        downstream.
      </p>
    </div>
  );
}
