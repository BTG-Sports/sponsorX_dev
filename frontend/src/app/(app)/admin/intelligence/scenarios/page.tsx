import type { ReactNode } from "react";

import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { ScenarioPlanner } from "@/components/scenario-planner";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { apiListQuery } from "@/lib/list-query";
import { SAMPLE_SCENARIO_DESK, SCENARIOS_PATH, type ApiScenarioDesk } from "@/lib/scenarios-live";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S7-FE-03 — the scenario planner (Spec §16 P3-08). The sales-conversation
   screen: change budget, CPM, audience and inventory mix while a sponsor
   watches, and compare two scenarios' expected delivery and revenue.

   Reads  GET  /intelligence/scenarios?page&size   (saved list + defaults +
               the formats / sports / states / age bands the engine prices)
   Writes POST /intelligence/scenarios/calculate { inputs }   (live, debounced)
          POST /intelligence/scenarios { name, inputs }       (save)
          — both through ./actions.ts. Contract: lib/scenarios-live.ts.

   The engine (3S7-BE-01, on 3S4-BE-01's forecast) isn't mounted yet: the
   saved-list read is the liveness check, and until it answers the page is
   its title and <EnginePending> — no figure at all. A real API error throws
   to the error boundary. ?demo=loading|empty|error, and ?demo=sample
   (development only) runs the planner on lib/scenarios-live.ts's sample
   calculator under a <SampleBanner>.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const TITLE = "Scenario planner";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ScenarioPlannerPage({ searchParams }: { searchParams: SP }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <Frame>
        <SkeletonRows rows={4} />
      </Frame>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(SCENARIOS_PATH);
  if (lacking) return <NotInRole path={SCENARIOS_PATH} title={TITLE} roles={lacking} />;

  if (await wantsSample(searchParams)) {
    return (
      <Frame pill={<Pill text="Sample" />}>
        <SampleBanner />
        <ScenarioPlanner desk={SAMPLE_SCENARIO_DESK} sample />
      </Frame>
    );
  }

  if (demo === "empty") {
    return (
      <Frame>
        <EmptyState mark="inbox" title="No scenario choices yet" hint="The planner fills once the scenario engine offers formats to price. Nothing is calculated without it." />
      </Frame>
    );
  }

  const sp = await searchParams;
  const read = await readEngine<ApiScenarioDesk>("scenarios", `/intelligence/scenarios${apiListQuery(sp, {})}`);
  if (read.state === "pending") {
    return (
      <Frame>
        <EnginePending engine={read.engine} />
      </Frame>
    );
  }
  return (
    <Frame pill={<Pill text="Live" />}>
      <ScenarioPlanner desk={read.data} sample={false} />
    </Frame>
  );
}

function Frame({ children, pill }: { children: ReactNode; pill?: ReactNode }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="sx-page-title">{TITLE}</h1>
        {pill}
      </div>
      {children}
    </div>
  );
}

function Pill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${text === "Sample" ? "bg-warn" : "bg-accent"}`} />
      {text} · scenario engine
    </span>
  );
}
