import { AnomalyReview, KindChips, SeverityPill } from "@/components/anomaly-console";
import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { IntelDeskHeader, KpiTile } from "@/components/intel-desk-bits";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { ServerList } from "@/components/server-pager";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import {
  ANOMALY_EMPTY,
  ANOMALY_KINDS,
  ANOMALY_TABS,
  KIND,
  OUTCOME_LABEL,
  SUBJECT_LABEL,
  anomalyTab,
  emptyAnomalyDesk,
  kindParam,
  ruleLabel,
  rulesRan,
  sampleAnomalies,
  type AnomalyDesk,
  type AnomalyKind,
  type AnomalyTab,
} from "@/lib/anomalies-live";
import { demoState } from "@/lib/demo";
import { momentLabel, qs } from "@/lib/intel-admin";
import { ENGINES } from "@/lib/intelligence";
import { apiListQuery } from "@/lib/list-query";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   3S8-FE-01 · Data quality and anomaly console (Spec §16 P3-09, acceptance
   #10). Flagged metric streams, duplicate events, bot-like behaviour,
   suspicious redemptions and manual-entry mismatches — and the reviewer's
   disposition on each.

   Open flags per kind as KPI tiles, then the work: To review / Resolved
   tabs, instant kind chips, a server-paged table, and a slide-over per row
   with the rule's evidence and the disposition form (a note of 8 to 2,000
   characters for every outcome) — components/anomaly-console.tsx.
   Resolved holds a person's final decisions AND SponsorX's automatic ones
   (a duplicate post, excluded the night it is seen), which a person may
   still replace — the row says which.

   Reads  GET  /intelligence/anomalies?tab=open|resolved&kind&page&size
   Writes POST /intelligence/anomalies/:id/disposition { outcome, note } (./actions.ts)
   Engine "anomalies" (3S8-DATA-01, live); until it answers, <EnginePending>
   and no number. `asOf` is the epoch until the rules first run — then the
   header shows no time and the desk says so.
   BTG admins and campaign managers. ?demo=loading|empty|error|sample.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/intelligence/anomalies";
const TITLE = "Anomalies";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function AnomaliesPage({ searchParams }: { searchParams: SP }) {
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
  const tab = anomalyTab(sp.tab);
  const kind = kindParam(sp.kind);

  if (await wantsSample(searchParams)) {
    return (
      <div className="space-y-5">
        <SampleBanner />
        <Console desk={sampleAnomalies(tab, kind)} tab={tab} kind={kind} sample />
      </div>
    );
  }
  if (demo === "empty") return <Console desk={emptyAnomalyDesk()} tab={tab} kind={kind} />;

  const read = await readEngine<AnomalyDesk>("anomalies", `/intelligence/anomalies${apiListQuery(sp, { tab, kind })}`);
  if (read.state === "pending") {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <EnginePending engine={read.engine} />
      </div>
    );
  }
  return <Console desk={read.data} tab={tab} kind={kind} />;
}

function Console({ desk, tab, kind, sample = false }: { desk: AnomalyDesk; tab: AnomalyTab; kind: AnomalyKind | ""; sample?: boolean }) {
  const rows = desk.anomalies;
  const none = ANOMALY_EMPTY[tab];
  const demo = sample ? "sample" : null;
  const columns: Column[] = [
    { key: "subject", label: "Flagged" },
    { key: "kind", label: "Kind" },
    { key: "severity", label: "Severity" },
    { key: "rule", label: "Rule" },
    { key: "when", label: tab === "open" ? "Detected" : "Outcome" },
    { key: "action", label: "Action", srOnly: true },
  ];

  return (
    <div className="space-y-5">
      <IntelDeskHeader title={TITLE} engine={ENGINES.anomalies.name} asOf={rulesRan(desk.asOf) ? desk.asOf : undefined} sample={sample}>
        {!rulesRan(desk.asOf) && <span className="text-[11px] text-muted">The rules haven&rsquo;t run for this tenant yet — they run nightly.</span>}
      </IntelDeskHeader>

      <ul aria-label="Open flags by kind" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {ANOMALY_KINDS.map((k) => {
          const n = desk.counts.openByKind[k] ?? 0;
          return (
            <li key={k}>
              <KpiTile label={KIND[k].label} value={n.toLocaleString("en-US")} sub="open flags" tone={n > 0 ? "warn" : undefined} />
            </li>
          );
        })}
      </ul>

      <TabStrip label="Anomalies">
        {ANOMALY_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}${qs({ tab: t.key === "open" ? null : t.key, kind: kind || null, demo })}`} on={t.key === tab} count={desk.counts[t.key]} hot={t.key === "open"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      <ServerList>
        <KindChips kind={kind} openByKind={desk.counts.openByKind} />
        <div className="mt-3">
          {rows.length === 0 ? (
            <EmptyState mark="inbox" title={kind ? `No ${KIND[kind].label.toLowerCase()} here` : none.title} hint={none.hint} />
          ) : (
            <PagedTable bare page={desk.page} filtered={Boolean(kind)} noun="Flags" label={tab === "open" ? "Flags to review" : "Resolved flags"} columns={columns}>
              {rows.map((a, i) => (
                <Tr key={a.id} i={i} tone={!a.disposition && a.severity === "high" ? "danger" : undefined}>
                  <Td>
                    <Primary sub={SUBJECT_LABEL[a.subject.type]}>{a.subject.name}</Primary>
                  </Td>
                  <Td label="Kind">{KIND[a.kind].label}</Td>
                  <Td label="Severity">
                    <SeverityPill severity={a.severity} />
                  </Td>
                  <Td label="Rule" muted>
                    <code className="text-[11px]">{ruleLabel(a.rule)}</code>
                  </Td>
                  <Td label={tab === "open" ? "Detected" : "Outcome"} muted>
                    {a.disposition ? (
                      <span className="block">
                        <span className="block text-[13px] font-medium text-text">
                          {OUTCOME_LABEL[a.disposition.outcome]}
                          {a.disposition.automatic && (
                            <span className="ml-1.5 rounded-full bg-admin/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-text">automatic</span>
                          )}
                        </span>
                        <span className="block text-[11px]">
                          {a.disposition.by} · {momentLabel(a.disposition.at)}
                          {a.disposition.automatic ? " · you may replace it" : " · final"}
                        </span>
                      </span>
                    ) : (
                      momentLabel(a.detectedAt)
                    )}
                  </Td>
                  <Td act>
                    <AnomalyReview anomaly={a} preview={sample} />
                  </Td>
                </Tr>
              ))}
            </PagedTable>
          )}
        </div>
      </ServerList>
    </div>
  );
}
