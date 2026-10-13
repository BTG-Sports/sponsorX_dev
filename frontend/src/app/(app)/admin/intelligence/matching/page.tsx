import type { ReactNode } from "react";

import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { ExplorerBriefPicker } from "@/components/explorer-brief-picker";
import { MatchExplorer } from "@/components/match-explorer";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { EmptyState, SkeletonRows } from "@/components/states";
import { StatTile } from "@/components/ui";
import { demoState } from "@/lib/demo";
import { textParam } from "@/lib/list-query";
import {
  EXPLORER_PATH,
  KIND_LABEL,
  SAMPLE_BRIEF_LIST,
  explorerBriefsQuery,
  filteredOutTotal,
  matchKindOf,
  matchesPath,
  sampleMatchPage,
  utcMinute,
  type ApiBriefList,
  type ApiMatchPage,
} from "@/lib/match-explorer-live";
import type { ApiBrief } from "@/lib/matching-live";
import { apiFetch } from "@/server/api";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S3-FE-01 — the sponsor match explorer (Spec §16 P3-02).

   Pick a sponsor brief, see athletes, properties and inventory ranked
   against it with a match score and the reasons behind it, and save a
   shortlist. The scored, explained view; the Matching Studio
   (/admin/campaigns/match) stays where rosters are built and invitations
   sent.

   Reads  GET /briefs?state=APPROVED,CAMPAIGN_CREATED,QUALIFIED&sort=desk&q&page&size
              (real — the picker; URL keys ?bq ?bpage ?bsize)
          GET /intelligence/briefs/:briefId/matches?kind&page&size
              (the match scoring engine, 3S3-BE-02 — readEngine)
   Writes POST /intelligence/briefs/:briefId/shortlist { entryIds } (./actions.ts)

   Engine not mounted → title + <EnginePending>, nothing numeric. A real
   API error throws to the error boundary. ?demo=loading|empty|error, and
   ?demo=sample (development only) previews the live layout on
   lib/match-explorer-live.ts SAMPLE data under a <SampleBanner>.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const TITLE = "Match explorer";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function MatchExplorerPage({ searchParams }: { searchParams: SP }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(EXPLORER_PATH);
  if (lacking) return <NotInRole path={EXPLORER_PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const kind = matchKindOf(sp);
  const bq = textParam(sp, "bq");
  const want = textParam(sp, "brief");

  if (await wantsSample(searchParams)) {
    const brief = SAMPLE_BRIEF_LIST.briefs.find((b) => b.id === want) ?? SAMPLE_BRIEF_LIST.briefs[0];
    return (
      <Explorer list={SAMPLE_BRIEF_LIST} q="" brief={brief} data={sampleMatchPage(kind, brief.id)} sample banner={<SampleBanner />} />
    );
  }

  if (demo === "empty") return <NoBrief />;

  /* The picker — real briefs. A 403 is the API's answer for a role (Sales
     may not read briefs), not an outage. */
  const listRes = await apiFetch(`/briefs${explorerBriefsQuery(sp)}`);
  if (listRes.status === 403) {
    return (
      <Frame>
        <EmptyState mark="users" title="Briefs are outside your role" hint="The explorer ranks against a sponsor brief, and your role doesn't read briefs. Ask a BTG admin for the brief you need." />
      </Frame>
    );
  }
  if (!listRes.ok) throw new Error(`Briefs unavailable (${listRes.status}).`);
  const list = (await listRes.json()) as ApiBriefList;

  /* ?brief= picks one (it needn't be on this picker page); otherwise the
     page's first. One that isn't the caller's, or is gone, falls back. */
  let brief: ApiBrief | undefined = list.briefs.find((b) => b.id === want);
  if (want && !brief) {
    const res = await apiFetch(`/briefs/${encodeURIComponent(want)}`);
    if (res.ok) brief = (await res.json()) as ApiBrief;
    else if (res.status !== 403 && res.status !== 404) throw new Error(`Brief unavailable (${res.status}).`);
  }
  brief ??= list.briefs[0];
  if (!brief) {
    return bq ? (
      <Frame>
        <ExplorerBriefPicker briefs={list.briefs} page={list.page} q={bq} currentId={null} />
      </Frame>
    ) : (
      <NoBrief />
    );
  }

  const read = await readEngine<ApiMatchPage>("matching", matchesPath(brief.id, sp, kind));
  if (read.state === "pending") {
    return (
      <Frame>
        <EnginePending engine={read.engine} />
      </Frame>
    );
  }
  return <Explorer list={list} q={bq} brief={brief} data={read.data} sample={false} />;
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

function NoBrief() {
  return (
    <Frame>
      <EmptyState
        mark="inbox"
        title="No brief is waiting for matching"
        hint="A sponsor brief lands here once BTG qualifies it; the explorer ranks the network against it."
        action={{ label: "Open sponsor briefs", href: "/admin/briefs" }}
      />
    </Frame>
  );
}

function Explorer({
  list,
  q,
  brief,
  data,
  sample,
  banner,
}: {
  list: ApiBriefList;
  q: string;
  brief: ApiBrief;
  data: ApiMatchPage;
  sample: boolean;
  banner?: ReactNode;
}) {
  const kind = data.kind;
  const out = filteredOutTotal(data.filteredOut);
  const saved = data.shortlist;
  return (
    <Frame
      pill={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-medium text-muted">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${sample ? "bg-warn" : "bg-accent"}`} />
          {sample ? "Sample" : "Live"} · {data.run.modelVersion}
        </span>
      }
    >
      {banner}
      <ExplorerBriefPicker briefs={list.briefs} page={list.page} q={q} currentId={brief.id} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={`Ranked ${KIND_LABEL[kind].many.toLowerCase()}`} value={data.counts[kind].toLocaleString("en-US")} sub={`against ${brief.sponsorName}`} />
        <StatTile label="Filtered out" value={out.toLocaleString("en-US")} sub="unavailable, conflicted or unsafe" />
        <StatTile label="On saved shortlist" value={(saved?.entries.length ?? 0).toLocaleString("en-US")} sub={saved ? `saved ${utcMinute(saved.savedAt)}` : "none saved yet"} />
        <StatTile label="Ranked" value={utcMinute(data.run.computedAt).slice(0, 10)} sub={data.run.modelVersion} />
      </div>

      <MatchExplorer key={brief.id} briefId={brief.id} data={data} sample={sample} />
    </Frame>
  );
}
