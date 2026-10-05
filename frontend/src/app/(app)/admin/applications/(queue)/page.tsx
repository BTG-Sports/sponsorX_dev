import { ApplicationsDesk } from "@/components/applications-desk";
import { OpsStage } from "@/components/ops-fx";
import { OpsGround } from "@/components/ops-stage";
import { ScoutHeader } from "@/components/scout-stage";
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
import { applications } from "@/lib/fixtures";
import { reviewAction } from "../actions";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";

/* --------------------------------------------------------------------------
   Athlete Network Manager Workspace — application review, §10 · §23 · §14.
   Redesigned 2026-09-14 (UX feedback: the old page was a flat card dump —
   every application fully expanded, spec jargon in the copy, dead buttons),
   and again 2026-10-05 as the "Scouting Board" (P1-ART-16, spec
   docs/superpowers/specs/2026-10-05-applications-scouting-board-design.md):
   the admin board's Mission Control stage, bled to the content column's
   edges, with the queue as a grid of glass player cards. Visual only — the
   reads, the paging and the review actions below are unchanged. The page
   sits in the (queue) route group only for its own dark loading screen.

   The queue itself is the ApplicationsDesk client island — tabs, instant
   search and filters, a score ring per card, and a slide-over review drawer
   where the §14 factor snapshot, the §4 guardian gate and the §26 conflict
   check live. Approve / Request info / Reject are the §11 B1 transitions.

   §14: the score is rules-based in Phase 1 (`method: "rules-v1"`) and stored
   as a factor snapshot so it can be explained after the fact — the drawer
   shows exactly that snapshot. Approval confirms the rate card (B2).

   LIVE vs DEMO (P3-FE-02, the marketplace precedent). A signed-in BTG
   reviewer sees the REAL queue — GET /applications, §21 states, the stored
   §14 snapshot — and the drawer's decisions POST through the reviewAction
   server function: begin-review, approve, request-changes, reject, each
   audited and emailed by the API. Anyone else, or any ?demo= state, keeps
   the fixture demo, under its "Demo data" notice. In live mode every figure
   is the API's: invented statistics don't belong beside real applicants
   (§22). Since P1-ART-16 the demo's hero shows the same four counts from the
   fixtures — its sample funnel and review-pace figures are gone.

   SERVER-PAGED (2026-09-29). Live mode no longer fetches the queue to filter
   it in the browser: ?page ?size ?tab ?q ?sport ?flag ?sort are read here,
   sent to GET /applications?page=, and the API answers exactly one page with
   its total; the hero's numbers and the tab counts come from GET
   /applications/summary, counted in the database. The demo keeps its
   client-side desk.
   -------------------------------------------------------------------------- */

/** The stage, bled to the edges of PortalShell's content column (P1-ART-14). */
const STAGE = "sx-ops sx-stage relative isolate -mx-6 -my-6 min-h-[calc(100svh-66px)] overflow-hidden px-5 pb-14 pt-8 sm:px-8 lg:px-10 lg:pt-10";

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

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <OpsStage className={STAGE}>
      {/* A dashboard: the stage's ground, no outlined word behind a hero. */}
      <OpsGround word="" />
      <div className="relative mx-auto max-w-[1440px]">{children}</div>
    </OpsStage>
  );
}

function EmptyQueue({ title }: { title: string }) {
  return (
    <div className="sx-ops-panel sx-ops-in relative mt-8 px-6 py-8" style={{ "--sx-reveal-delay": "0.5s" } as React.CSSProperties}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-[#9aa4b2]">New athlete applications land here from the public join page.</p>
      <a href="/join" target="_blank" rel="noopener" className="mt-3 inline-block text-xs text-[#63b4f8] hover:text-[#9be0ff]">
        Open the join page ↗
      </a>
    </div>
  );
}

const TRUST = "An athlete cannot go live with an unverified guardian — approval passes review; activation is the separate step that lets them take paid work.";

export default async function AdminApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "error") throw new Error("Demo error state");
  /* C-1: a staff role this desk isn't for gets "not in your role", not the
     sample desk. The demo stays for ?demo= and signed-out visitors. */
  if (demo === null) {
    const lacking = await staffWithoutAccess("/admin/applications");
    if (lacking) return <NotInRole path="/admin/applications" title="Applications" roles={lacking} />;
  }

  const sp = await searchParams;
  const live = demo === null ? await liveQueue(sp) : null;
  const readAt = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  if (demo === "loading") {
    return (
      <Stage>
        <ScoutHeader figures={{ waiting: 0, overdue: 0, total: 0, decided: 0 }} readAt={null} />
        <EmptyQueue title="Loading the queue…" />
      </Stage>
    );
  }

  if (demo === "empty" || (live && live.summary.total === 0)) {
    /* Empty means the whole scope is empty (the summary's total), not this
       page — a filtered-to-nothing page keeps the desk and its "Clear all". */
    return (
      <Stage>
        <ScoutHeader figures={{ waiting: 0, overdue: 0, total: 0, decided: 0 }} readAt={live ? readAt : null} />
        <EmptyQueue title={live ? "No applications yet" : "No applications in the queue"} />
      </Stage>
    );
  }

  // Demo: seed the desk's tabs and filters from the URL so a filtered queue
  // is shareable; the island clamps stale values and keeps the URL in sync.
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : "";

  /* ------------------------------------------------------------- live mode */
  if (live) {
    const { waiting, overdue, decided, total } = live.summary;
    return (
      <Stage>
        <ScoutHeader figures={{ waiting, overdue, total, decided }} readAt={readAt} />
        <section aria-label="The queue" className="mt-8">
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
        <p className="sx-ops-in mt-8 text-[11px] leading-relaxed text-[#7e88a0]" style={{ "--sx-reveal-delay": "0.9s" } as React.CSSProperties}>
          {TRUST}
        </p>
      </Stage>
    );
  }

  /* ------------------------------------------------------------- demo mode */
  const waitingApps = applications.filter((a) => a.state === "SUBMITTED" || a.state === "UNDER_REVIEW");
  const figures = {
    waiting: waitingApps.length,
    overdue: waitingApps.filter((a) => waitHours(a.submittedAt) > AGING_HOURS).length,
    total: applications.length,
    decided: applications.filter((a) => a.state === "APPROVED" || a.state === "REJECTED").length,
  };

  return (
    <Stage>
      {/* P7-QA-02: this fixture branch also reaches signed-in staff who may
          not review (SALES, CAMPAIGN_MGR, FINANCE) — every figure is sample data. */}
      {demo === null && (
        <p role="note" className="sx-ops-in mb-6 inline-flex items-center gap-2 rounded-full border border-[#f97a1f]/40 bg-[#f97a1f]/10 px-3.5 py-1.5 text-xs font-medium text-[#fdba74]">
          <span aria-hidden="true">●</span>
          Demo data — the live review queue is read by BTG admin and the Network Manager, so every figure below is sample data.
        </p>
      )}
      <ScoutHeader figures={figures} readAt={null} />
      <section aria-label="The queue" className="mt-8">
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
      <p className="sx-ops-in mt-8 text-[11px] leading-relaxed text-[#7e88a0]" style={{ "--sx-reveal-delay": "0.9s" } as React.CSSProperties}>
        An athlete cannot go live with an unverified guardian or an unresolved category conflict — approval is also what confirms their rate card downstream.
      </p>
    </Stage>
  );
}
