import Link from "next/link";

import { ClassBadge, ClassTiles } from "@/components/attribution-bits";
import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { IntelDeskHeader } from "@/components/intel-desk-bits";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { ListFilter, ServerList } from "@/components/server-pager";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import {
  ATTRIBUTION_EMPTY,
  ATTRIBUTION_TABS,
  CLASS_OPTIONS,
  UNMATCHED_REASON,
  amountOf,
  attributionTab,
  classParam,
  classTiles,
  displayClass,
  emptyAttributionDesk,
  methodLine,
  sampleAttribution,
  windowLabel,
  type AttributionDesk,
  type AttributionTab,
} from "@/lib/attribution-live";
import { demoState } from "@/lib/demo";
import { momentLabel, one, qs } from "@/lib/intel-admin";
import { ENGINES, confidenceLabel, type AttributionClass } from "@/lib/intelligence";
import { apiListQuery } from "@/lib/list-query";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S6-FE-01 · Attribution dashboard (Spec §16 P3-05, acceptance #8).

   Four claims kept apart: verified redemptions, verified transactions,
   modelled attribution and estimated media value — four tiles, each with its
   own sentence and its own look (components/attribution-bits.tsx), never
   summed. Under them, two tabs: the attributed events (source, class,
   method and match key, window, confidence, amount, what it matched), and
   the reconciliation queue — events the engine could not match, kept in
   view with the reason (3S6-BE-04). Read-only.

   Reads  GET /intelligence/attribution?campaign&tab=events|unmatched&class&page&size
          (lib/attribution-live.ts). Engine "attribution"; until it answers,
          <EnginePending> and no number at all.
   BTG admins, campaign managers and Sales. ?demo=loading|empty|error, and
   ?demo=sample (development only) previews the live layout on the sample.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/intelligence/attribution";
const TITLE = "Attribution";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AttributionPage({ searchParams }: { searchParams: SP }) {
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

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;

  const sp = await searchParams;
  const tab = attributionTab(sp.tab);
  const cls = tab === "events" ? classParam(sp.class) : "";
  const campaign = one(sp.campaign).slice(0, 100);

  if (await wantsSample(searchParams)) {
    return (
      <div className="space-y-5">
        <SampleBanner />
        <Desk desk={sampleAttribution(tab, cls)} tab={tab} cls={cls} campaign="" sample />
      </div>
    );
  }
  if (demo === "empty") return <Desk desk={emptyAttributionDesk(tab)} tab={tab} cls={cls} campaign={campaign} />;

  const read = await readEngine<AttributionDesk>("attribution", `/intelligence/attribution${apiListQuery(sp, { tab, class: cls, campaign })}`);
  if (read.state === "pending") {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <EnginePending engine={read.engine} />
      </div>
    );
  }
  return <Desk desk={read.data} tab={tab} cls={cls} campaign={campaign} />;
}

function Desk({ desk, tab, cls, campaign, sample = false }: { desk: AttributionDesk; tab: AttributionTab; cls: AttributionClass | ""; campaign: string; sample?: boolean }) {
  const scoped = desk.scope?.campaign ?? null;
  const keep = { campaign: campaign || null, demo: sample ? "sample" : null };
  const events = desk.events ?? [];
  const unmatched = desk.unmatched ?? [];
  const shown = tab === "events" ? events.length : unmatched.length;
  const none = ATTRIBUTION_EMPTY[tab];

  const eventCols: Column[] = [
    { key: "source", label: "Source" },
    { key: "class", label: "Class" },
    { key: "method", label: "Method" },
    { key: "confidence", label: "Confidence" },
    { key: "amount", label: "Amount", num: true },
    { key: "matched", label: "Matched to" },
    { key: "when", label: "When" },
  ];
  const unmatchedCols: Column[] = [
    { key: "source", label: "Source" },
    { key: "reason", label: "Why it's unmatched" },
    { key: "amount", label: "Amount", num: true },
    { key: "when", label: "Received" },
  ];

  return (
    <div className="space-y-5">
      <IntelDeskHeader title={TITLE} engine={ENGINES.attribution.name} asOf={desk.asOf} sample={sample}>
        {scoped && (
          <Link
            href={`${PATH}${qs({ tab: tab === "events" ? null : tab })}`}
            aria-label={`Show every campaign, not just ${scoped.name}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-admin/30 bg-admin/10 py-0.5 pl-2.5 pr-2 text-[11px] font-medium text-text hover:border-danger/40"
          >
            Campaign · {scoped.name} <span aria-hidden="true">✕</span>
          </Link>
        )}
      </IntelDeskHeader>

      <ClassTiles tiles={classTiles(desk.totals)} />

      <TabStrip label="Attribution">
        {ATTRIBUTION_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}${qs({ ...keep, tab: t.key === "events" ? null : t.key })}`} on={t.key === tab} count={desk.counts[t.key]} hot={t.key === "unmatched"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      <ServerList>
        {tab === "events" && (
          <div className="flex flex-wrap items-center gap-2">
            <ListFilter param="class" value={cls} label="Filter by attribution class" allLabel="All four classes" options={CLASS_OPTIONS} tone="admin" />
          </div>
        )}

        {shown === 0 ? (
          <div className="mt-3">
            <EmptyState mark={tab === "events" ? "chart" : "inbox"} title={none.title} hint={none.hint} />
          </div>
        ) : tab === "events" ? (
          <div className="mt-3">
            <PagedTable bare page={desk.page} filtered={Boolean(cls)} noun="Events" label="Attributed events" columns={eventCols}>
              {events.map((e, i) => {
                const shownAs = displayClass(e);
                return (
                  <Tr key={e.id} i={i} tone={shownAs.demoted ? "warn" : undefined}>
                    {/* Column balance on a laptop: Source and Matched-to keep a
                        readable minimum, the demoted note wraps narrower, and
                        When stays on one line clear of the card's edge. */}
                    <Td>
                      <span className="block min-w-0 md:min-w-[9rem]">
                        <Primary sub={e.source.adapter}>{e.source.partner}</Primary>
                      </span>
                    </Td>
                    {/* One wrapper per cell: on a phone the stacked-card CSS makes a
                        labelled cell's direct children inline, which split the
                        badge apart and glued the method to its window. */}
                    <Td label="Class">
                      <span className="block min-w-0">
                        <ClassBadge cls={shownAs.cls} />
                        {shownAs.demoted && (
                          <span className="mt-1 block max-w-44 text-[11px] text-warn">Sent as verified, but matched probabilistically — shown as modelled.</span>
                        )}
                      </span>
                    </Td>
                    <Td label="Method">
                      <span className="block min-w-0">
                        <span className="block text-[13px]">{methodLine(e)}</span>
                        <span className="block text-[11px] text-muted">{e.windowDays > 0 ? windowLabel(e.windowDays) : "no window — recorded directly"}</span>
                      </span>
                    </Td>
                    <Td label="Confidence" muted>{confidenceLabel(e.confidence)}</Td>
                    <Td label="Amount" num>{amountOf(e.amountCents)}</Td>
                    <Td label="Matched to">
                      <span className="block min-w-0 md:min-w-[9rem]">
                        {e.campaign ? <Primary sub={e.athlete?.name ?? "no athlete"}>{e.campaign.name}</Primary> : <span className="text-muted">—</span>}
                      </span>
                    </Td>
                    <Td label="When" muted className="whitespace-nowrap md:pr-5">{momentLabel(e.occurredAt)}</Td>
                  </Tr>
                );
              })}
            </PagedTable>
          </div>
        ) : (
          <div className="mt-3">
            <PagedTable
              bare
              page={desk.page}
              noun="Events"
              label="Unmatched and ambiguous events"
              columns={unmatchedCols}
              foot={<p className="text-[11px] text-faint">Read-only. An event the engine could not match stays here rather than disappearing — no amount from this list counts toward any class above.</p>}
            >
              {unmatched.map((u, i) => {
                const r = UNMATCHED_REASON[u.reason];
                return (
                  <Tr key={u.id} i={i} tone={u.reason === "ambiguous" ? "warn" : undefined}>
                    <Td>
                      <Primary sub={`${u.source.adapter} · ${u.reference}`}>{u.source.partner}</Primary>
                    </Td>
                    <Td label="Why">
                      <span className="block min-w-0">
                        <strong className="block text-[13px] font-semibold">
                          {r.label}
                          {u.reason === "ambiguous" && u.candidates ? ` · ${u.candidates} candidate campaigns` : ""}
                        </strong>
                        <span className="block max-w-80 text-[11px] text-muted">{r.hint}</span>
                      </span>
                    </Td>
                    <Td label="Amount" num>{amountOf(u.amountCents)}</Td>
                    <Td label="Received" muted className="whitespace-nowrap md:pr-5">{momentLabel(u.receivedAt)}</Td>
                  </Tr>
                );
              })}
            </PagedTable>
          </div>
        )}
      </ServerList>
    </div>
  );
}
