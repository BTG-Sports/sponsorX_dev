import { BlockedNotice, StatTile } from "@/components/ui";
import { EmptyState, SkeletonPage } from "@/components/states";
import { DeliverableCalendar } from "@/components/deliverable-calendar";
import { demoState } from "@/lib/demo";
import { deliverables as fixtureRows } from "@/lib/fixtures";
import {
  TABS,
  agendaQuery,
  athleteHeadline,
  fixtureDeliverables,
  gridRange,
  inRange,
  pageAgenda,
  parseDay,
  parseMonth,
  summarizeRows,
  type ApiDeliverable,
  type ApiDeliverableSummary,
  type TabKey,
} from "@/lib/deliverables-live";
import { pageParams, textParam, type PageInfo, type SearchParams } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Deliverables — the athlete's calendar of what is due when (P5-FE-02, §24).

   LIVE vs DEMO (the P3-FE-02 precedent). A signed-in athlete (or their
   guardian, read only) sees the REAL set — their own scope: every
   deliverable their accepted Campaign Orders created, with due dates,
   appearance days (SX-05), and any revision BTG or the sponsor asked for.
   Each opens its own page to upload and publish (P5-FE-03). Anyone else, or
   any ?demo= state, sees the fixture deliverables dated around today.

   SERVER-DRIVEN (2026-09-29). Three bounded reads, never "everything":
   GET /deliverables?from&to — the month grid's rows (?month=YYYY-MM);
   GET /deliverables?page&size&tab (+ the picked ?day's range) — one page of
   the agenda; GET /deliverables/summary — the tiles and the tab counts,
   counted in the database. The fixture mode runs the same shapes through
   the pure helpers in deliverables-live.
   -------------------------------------------------------------------------- */

type View = {
  summary: ApiDeliverableSummary;
  gridRows: ApiDeliverable[];
  agenda: { rows: ApiDeliverable[]; page: PageInfo };
};
type Ask = { month: string; day: string; tab: TabKey; page: number; size: number };

async function liveView(ask: Ask): Promise<View | null> {
  /* No catch — an outage is an error page, never fixtures dressed as the
     athlete's own obligations (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => r === "ATHLETE" || r === "GUARDIAN")) return null;
  const grid = gridRange(ask.month);
  const [sumRes, gridRes, agendaRes] = await Promise.all([
    apiFetch("/deliverables/summary"),
    apiFetch(`/deliverables?${new URLSearchParams(grid)}`),
    apiFetch(`/deliverables${agendaQuery(ask)}`),
  ]);
  for (const r of [sumRes, gridRes, agendaRes]) {
    if (!r.ok) throw new Error(`Deliverables unavailable (${r.status}).`);
  }
  const summary = (await sumRes.json()) as ApiDeliverableSummary;
  const gridRows = ((await gridRes.json()) as { deliverables: ApiDeliverable[] }).deliverables;
  const agendaBody = (await agendaRes.json()) as { deliverables: ApiDeliverable[]; page: PageInfo };
  return { summary, gridRows, agenda: { rows: agendaBody.deliverables, page: agendaBody.page } };
}

function fixtureView(rows: ApiDeliverable[], ask: Ask, today: Date): View {
  return {
    summary: summarizeRows(rows, today),
    gridRows: inRange(rows, gridRange(ask.month)),
    agenda: pageAgenda(rows, ask),
  };
}

export default async function DeliverablesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const today = new Date();
  const ask: Ask = {
    month: parseMonth(textParam(sp, "month"), today),
    day: parseDay(textParam(sp, "day")),
    tab: (textParam(sp, "tab", TABS.map((t) => t.key)) || "todo") as TabKey,
    ...pageParams(sp),
  };

  const live = demo === null ? await liveView(ask) : null;
  const view =
    live ?? fixtureView(demo === "empty" ? [] : fixtureDeliverables(fixtureRows, today), ask, today);
  const head = athleteHeadline(view.summary);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Deliverables</h1>
        <p className="mt-1 text-xs text-muted">
          Everything your Campaign Orders ask for, by due date — open one to
          upload your draft or mark it published.
        </p>
      </div>

      {view.summary.total > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatTile label="Your move" value={String(head.yourMove)} sub="to upload or publish" />
          <StatTile label="Overdue" value={String(head.overdue)} sub={head.overdue ? "past due and still yours" : "nothing late"} />
          <StatTile label="Revisions" value={String(head.revisions)} sub="asked for changes" />
          <StatTile label="In review" value={String(head.inReview)} sub="with BTG or the sponsor" />
        </div>
      )}

      {!live && demo !== "empty" && (
        <BlockedNotice>
          Demo data — sign in as an athlete to see your real deliverables.
        </BlockedNotice>
      )}

      {view.summary.total === 0 ? (
        <EmptyState
          mark="inbox"
          title="Nothing due yet"
          hint="Deliverables appear here the moment you accept a Campaign Order — each with its due date."
          action={{ label: "See invitations", href: "/athlete/invitations" }}
        />
      ) : (
        <DeliverableCalendar
          gridRows={view.gridRows}
          agenda={view.agenda}
          counts={head.tabs}
          month={ask.month}
          day={ask.day}
          tab={ask.tab}
          todayIso={today.toISOString()}
          linked={Boolean(live)}
        />
      )}
    </div>
  );
}
