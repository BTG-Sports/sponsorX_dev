import { BlockedNotice, StatTile } from "@/components/ui";
import { SkeletonPage } from "@/components/states";
import { DeliverableCalendar } from "@/components/deliverable-calendar";
import { demoState } from "@/lib/demo";
import { deliverables as fixtureRows } from "@/lib/fixtures";
import {
  fixtureDeliverables,
  isOverdue,
  nextStep,
  type ApiDeliverable,
} from "@/lib/deliverables-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Deliverables — the athlete's calendar of what is due when (P5-FE-02, §24).

   LIVE vs DEMO (the P3-FE-02 precedent). A signed-in athlete (or their
   guardian, read only) sees the REAL set — GET /deliverables, their own
   scope: every deliverable their accepted Campaign Orders created, with due
   dates, appearance days (SX-05), and any revision BTG or the sponsor asked
   for. Each opens its own page to upload and publish (P5-FE-03). Anyone
   else, or any ?demo= state, sees the fixture deliverables dated around
   today.
   -------------------------------------------------------------------------- */

async function liveDeliverables(): Promise<ApiDeliverable[] | null> {
  /* No catch — an outage is an error page, never fixtures dressed as the
     athlete's own obligations (QA pass 4 rule). */
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.some((r) => r === "ATHLETE" || r === "GUARDIAN")) return null;
  const res = await apiFetch("/deliverables");
  if (!res.ok) throw new Error(`Deliverables unavailable (${res.status}).`);
  return ((await res.json()) as { deliverables: ApiDeliverable[] }).deliverables;
}

export default async function DeliverablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");

  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const today = new Date();

  const live = demo === null ? await liveDeliverables() : null;
  const rows: ApiDeliverable[] =
    live ?? (demo === "empty" ? [] : fixtureDeliverables(fixtureRows, today));

  const yours = rows.filter((d) => nextStep(d).on === "you");
  const overdue = rows.filter((d) => isOverdue(d, today));
  const revisions = rows.filter((d) => d.revision);
  const inReview = rows.filter((d) => ["btg", "sponsor"].includes(nextStep(d).on));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Deliverables</h1>
        <p className="mt-1 text-xs text-muted">
          Everything your Campaign Orders ask for, by due date — open one to
          upload your draft or mark it published.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <StatTile label="Your move" value={String(yours.length)} sub="to upload or publish" />
          <StatTile label="Overdue" value={String(overdue.length)} sub={overdue.length ? "past due and still yours" : "nothing late"} />
          <StatTile label="Revisions" value={String(revisions.length)} sub="asked for changes" />
          <StatTile label="In review" value={String(inReview.length)} sub="with BTG or the sponsor" />
        </div>
      )}

      {!live && demo !== "empty" && (
        <BlockedNotice>
          Demo data — sign in as an athlete to see your real deliverables.
        </BlockedNotice>
      )}

      <DeliverableCalendar
        rows={rows}
        todayIso={today.toISOString()}
        initial={{ month: one(sp.month), day: one(sp.day), tab: one(sp.tab) }}
        demoParam={one(sp.demo)}
        linked={Boolean(live)}
      />
    </div>
  );
}
