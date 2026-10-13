import Link from "next/link";

import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { PacingBar, RiskBadge } from "@/components/forecast-bits";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { KpiTile } from "@/components/ops-stage";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  EMPTY_FORECAST_LIST, FORECAST_TABS, METRIC_WORD, daysLeftWords, fmtCount, forecastTab, paceWords, sampleForecastList, sampleHref, tabCount,
  type ForecastList, type ForecastTabKey,
} from "@/lib/forecast-live";
import { confidenceLabel, pct } from "@/lib/intelligence";
import { apiListQuery } from "@/lib/list-query";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   Campaign forecasts — 3S4-FE-01 (Spec §16 P3-03). "Dashboard shows pacing
   and risk for every active campaign": a Mission Control desk — small
   title, four tiles from the API's counts, risk tabs, then one server-paged
   row per active campaign with its mini pacing bar, projected final,
   probability of the guarantee (with the model's version and confidence)
   and risk. A row opens the campaign's forecast (./[campaignId]).

   Reads  GET /intelligence/forecasts?risk&page&size   (lib/forecast-live.ts)
   Until the delivery forecast service (3S4-BE-01) is mounted the desk shows
   <EnginePending> and no figure at all. ?demo=loading|empty|error renders
   the branded states; ?demo=sample (development only) the live layout fed
   by SAMPLE_FORECAST_LIST, under a banner.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/intelligence/forecasts";
const TITLE = "Forecasts";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ForecastsPage({ searchParams }: { searchParams: SP }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const tab = forecastTab(sp.tab);
  const sample = await wantsSample(searchParams);

  if (sample) return <Desk list={sampleForecastList(tab.key)} tab={tab.key} sample />;
  if (demo === "empty") return <Desk list={EMPTY_FORECAST_LIST} tab={tab.key} sample={false} />;

  const read = await readEngine<ForecastList>("forecast", `/intelligence/forecasts${apiListQuery(sp, { risk: tab.key })}`);
  if (read.state === "pending") {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <EnginePending engine={read.engine} />
      </div>
    );
  }
  return <Desk list={read.data} tab={tab.key} sample={false} />;
}

function Desk({ list, tab, sample }: { list: ForecastList; tab: ForecastTabKey; sample: boolean }) {
  const { counts, campaigns: rows, page } = list;
  const now = new Date().getTime();
  const share = (n: number) => (counts.active ? n / counts.active : 0);
  const current = FORECAST_TABS.find((t) => t.key === tab)!;

  const columns: Column[] = [
    { key: "campaign", label: "Campaign", className: "min-w-52" },
    { key: "pacing", label: "Pacing", className: "min-w-44" },
    { key: "projected", label: "Projected final", num: true },
    { key: "probability", label: <>Probability<br />of guarantee</>, num: true },
    { key: "risk", label: "Risk" },
    { key: "ends", label: "Ends" },
    { key: "action", label: "Action", srOnly: true },
  ];

  return (
    <div className="space-y-5">
      {sample && <SampleBanner />}
      <h1 className="sx-page-title">{TITLE}</h1>

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Active campaigns" value={counts.active} caption="forecast nightly" tone="blue" delay={0.1} />
        <KpiTile label="At risk" value={counts.at_risk} caption={counts.at_risk ? "likely to miss" : "none at risk"} tone={counts.at_risk ? "orange" : "green"} share={share(counts.at_risk)} delay={0.16} />
        <KpiTile label="Watch" value={counts.watch} caption="past a threshold" tone="cyan" share={share(counts.watch)} delay={0.22} />
        <KpiTile label="On track" value={counts.on_track} caption="pacing to target" tone="green" share={share(counts.on_track)} delay={0.28} />
      </dl>

      <TabStrip label="Forecast risk">
        {FORECAST_TABS.map((t) => (
          <TabLink key={t.key} href={sampleHref(t.key === "all" ? PATH : `${PATH}?tab=${t.key}`, sample)} on={t.key === tab} count={tabCount(counts, t.key)} hot={t.key === "at_risk"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {rows.length === 0 ? (
        <EmptyState
          mark="inbox"
          title={tab === "all" ? "No active campaigns to forecast" : `No campaigns ${current.label.toLowerCase()}`}
          hint={tab === "all" ? "A campaign is forecast once it is live and has a guarantee to pace against." : "Campaigns appear here when the nightly forecast puts them in this band."}
        />
      ) : (
        <PagedTable page={page} noun="Campaigns" label={`Forecasts · ${current.label}`} columns={columns} filtered={tab !== "all"}>
          {rows.map((r, i) => (
            <Tr key={r.campaignId} i={i} tone={r.risk === "at_risk" ? "danger" : r.risk === "watch" ? "warn" : undefined}>
              <Td><Primary sub={r.sponsorName}>{r.campaignName}</Primary></Td>
              {/* One block wrapper per multi-part cell: a phone's stacked card makes a cell's direct children inline (globals.css). */}
              <Td label="Pacing">
                <span className="block min-w-0">
                  <PacingBar row={r} />
                  <span className="mt-1 block text-[11px] text-muted">
                    {paceWords(r)} · {fmtCount(r.delivered)} of {fmtCount(r.guarantee.value)} {METRIC_WORD[r.guarantee.metric]}
                  </span>
                </span>
              </Td>
              <Td label="Projected" num>
                <span className="block min-w-0">
                  <span className="block font-semibold">{fmtCount(r.projectedFinal.mid)}</span>
                  <span className="block text-[11px] text-muted">range {fmtCount(r.projectedFinal.low)} – {fmtCount(r.projectedFinal.high)}</span>
                </span>
              </Td>
              <Td label="Probability" num>
                <span className="block min-w-0">
                  <span className="block font-semibold">{pct(r.probabilityOfGuarantee)}</span>
                  <span className="block text-[11px] text-faint">{confidenceLabel(r.stamp.confidence)}</span>
                  <code className="block text-[10px] text-faint" title={`Model ${r.stamp.modelVersion}`}>{r.stamp.modelVersion}</code>
                </span>
              </Td>
              <Td label="Risk"><RiskBadge risk={r.risk} /></Td>
              <Td label="Ends" muted className="whitespace-nowrap">{daysLeftWords(r.endsAt, now)}</Td>
              <Td act>
                <Link
                  href={sampleHref(`${PATH}/${encodeURIComponent(r.campaignId)}`, sample)}
                  aria-label={`Open the ${r.campaignName} forecast`}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line px-3.5 text-sm font-medium text-text hover:bg-surface-2 md:min-h-9 md:w-auto md:text-xs"
                >
                  Open →
                </Link>
              </Td>
            </Tr>
          ))}
        </PagedTable>
      )}
    </div>
  );
}
