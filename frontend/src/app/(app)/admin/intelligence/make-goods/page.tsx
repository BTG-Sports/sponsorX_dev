import Link from "next/link";

import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { StatusChip } from "@/components/forecast-bits";
import { MakeGoodReview } from "@/components/makegood-review";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { KpiTile } from "@/components/ops-stage";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { METRIC_WORD, dayLabel, fmtCount, sampleHref } from "@/lib/forecast-live";
import { confidenceLabel, pct, usd } from "@/lib/intelligence";
import { apiListQuery, textParam } from "@/lib/list-query";
import {
  EMPTY_MAKEGOOD_LIST, MAKEGOOD_TABS, bestOption, decidedOption, equivalencyLabel, makeGoodTab, periodWords, sampleMakeGoodList, shortfallShare, signedUsd,
  type MakeGoodList, type MakeGoodStatus,
} from "@/lib/makegood-live";
import { readEngine, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   Make-good centre — 3S5-FE-01 (Spec §16 P3-04). "Centre surfaces
   shortfalls and lets a manager approve a substitution": a Mission Control
   desk — small title, three tiles from the API's counts (open shortfalls,
   their value, approvals this period), Open / Approved tabs, then one
   server-paged row per shortfall. A row's button opens its substitutes
   side by side in a drawer (components/makegood-review.tsx) — equivalency,
   cost impact, the three checks — and the approve-with-note form.

   `?campaign=<id>` narrows the desk to one campaign; the forecast page's
   "Find make-goods" links here that way.

   Reads  GET  /intelligence/make-goods?status&campaign&page&size   (lib/makegood-live.ts)
   Writes POST /intelligence/make-goods/:id/approve                 (./actions.ts)
   Until the make-good engine (3S5-BE-01) is mounted the desk shows
   <EnginePending> and no figure. ?demo=loading|empty|error renders the
   branded states; ?demo=sample (development only) the live layout fed by
   SAMPLE_MAKEGOOD_LIST, under a banner, with approvals that send nothing.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/intelligence/make-goods";
const TITLE = "Make-goods";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function MakeGoodsPage({ searchParams }: { searchParams: SP }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const tab = makeGoodTab(sp.tab);
  const campaign = textParam(sp, "campaign");

  if (await wantsSample(searchParams)) return <Desk list={sampleMakeGoodList(tab.key, campaign)} tab={tab.key} campaign={campaign} sample />;
  if (demo === "empty") return <Desk list={EMPTY_MAKEGOOD_LIST} tab={tab.key} campaign={campaign} sample={false} />;

  const read = await readEngine<MakeGoodList>("makegood", `/intelligence/make-goods${apiListQuery(sp, { status: tab.key, campaign })}`);
  if (read.state === "pending") {
    return (
      <div className="space-y-5">
        <h1 className="sx-page-title">{TITLE}</h1>
        <EnginePending engine={read.engine} />
      </div>
    );
  }
  return <Desk list={read.data} tab={tab.key} campaign={campaign} sample={false} />;
}

function Desk({ list, tab, campaign, sample }: { list: MakeGoodList; tab: MakeGoodStatus; campaign: string; sample: boolean }) {
  const { counts, shortfalls: rows, page } = list;
  const current = MAKEGOOD_TABS.find((t) => t.key === tab)!;
  const campaignName = campaign ? rows.find((r) => r.campaign.id === campaign)?.campaign.name ?? null : null;
  const href = (status: MakeGoodStatus) => {
    const u = new URLSearchParams();
    if (status !== "open") u.set("tab", status);
    if (campaign) u.set("campaign", campaign);
    const q = u.toString();
    return sampleHref(q ? `${PATH}?${q}` : PATH, sample);
  };
  const clearCampaign = sampleHref(tab === "open" ? PATH : `${PATH}?tab=${tab}`, sample);

  const columns: Column[] =
    tab === "open"
      ? [
          { key: "campaign", label: "Campaign" },
          { key: "short", label: "Shortfall", num: true },
          { key: "value", label: "Value short", num: true },
          { key: "best", label: "Best substitute" },
          { key: "model", label: "Model" },
          { key: "action", label: "Action", srOnly: true },
        ]
      : [
          { key: "campaign", label: "Campaign" },
          { key: "short", label: "Shortfall", num: true },
          { key: "approved", label: "Approved substitute" },
          { key: "by", label: "Approved by" },
          { key: "action", label: "Action", srOnly: true },
        ];

  return (
    <div className="space-y-5">
      {sample && <SampleBanner />}
      <h1 className="sx-page-title">{TITLE}</h1>

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <KpiTile label="Open shortfalls" value={counts.open} caption={counts.open ? "waiting on a substitute" : "nothing short"} tone={counts.open ? "orange" : "green"} delay={0.1} />
        <KpiTile label="Value at risk · USD" value={Math.round(counts.openValueCents / 100)} caption="estimated value of open shortfalls" tone="blue" delay={0.16} />
        <KpiTile label="Approved" value={counts.approvedThisPeriod} caption={periodWords(counts.period)} tone="green" delay={0.22} />
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        <TabStrip label="Make-good status">
          {MAKEGOOD_TABS.map((t) => (
            <TabLink key={t.key} href={href(t.key)} on={t.key === tab} count={counts[t.key]} hot={t.key === "open"}>
              {t.label}
            </TabLink>
          ))}
        </TabStrip>
        {campaign && (
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs">
            <span className="text-muted">Campaign</span>
            <strong className="font-semibold">{campaignName ?? campaign}</strong>
            <Link href={clearCampaign} aria-label="Show every campaign" className="text-muted hover:text-text">✕</Link>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          mark="inbox"
          title={tab === "open" ? "No open shortfalls" : "No approved make-goods"}
          hint={
            tab === "open"
              ? "A shortfall appears when a campaign's forecast falls below what was sold. Nothing is short right now."
              : "Substitutes a manager approves appear here, with who approved them and why."
          }
        />
      ) : (
        <PagedTable page={page} noun="Shortfalls" label={`Make-goods · ${current.label}`} columns={columns} filtered={Boolean(campaign)}>
          {rows.map((s, i) => {
            const shortCell = (
              <Td label="Shortfall" num>
                <span className="font-semibold">{fmtCount(s.shortfall)}</span>
                <span className="block text-[11px] text-muted">{pct(shortfallShare(s))} of {fmtCount(s.sold)} {METRIC_WORD[s.metric]}</span>
              </Td>
            );
            if (tab === "open") {
              const best = bestOption(s.options);
              return (
                <Tr key={s.id} i={i} tone={best ? "warn" : "danger"}>
                  <Td><Primary sub={`${s.sponsorName} · ends ${dayLabel(s.endsAt)}`}>{s.campaign.name}</Primary></Td>
                  {shortCell}
                  <Td label="Value short" num className="font-semibold">{usd(s.shortfallValueCents)}</Td>
                  <Td label="Best substitute">
                    {best ? (
                      <span className="block min-w-0">
                        <span className="block text-[13px]">{best.inventoryName}</span>
                        <span className="block text-[11px] text-muted">{equivalencyLabel(best.equivalencyScore)} · {signedUsd(best.costImpactCents)}</span>
                      </span>
                    ) : (
                      <StatusChip tone="danger">{s.options.length ? "None passes every check" : "No substitute found"}</StatusChip>
                    )}
                    <span className="mt-0.5 block text-[11px] text-faint">{s.options.length} option{s.options.length === 1 ? "" : "s"}</span>
                  </Td>
                  <Td label="Model" muted>
                    <code className="text-[11px]">{s.stamp.modelVersion}</code>
                    <span className="block text-[11px]">{confidenceLabel(s.stamp.confidence)}</span>
                  </Td>
                  <Td act><MakeGoodReview shortfall={s} sample={sample} /></Td>
                </Tr>
              );
            }
            const chosen = decidedOption(s);
            return (
              <Tr key={s.id} i={i}>
                <Td><Primary sub={s.sponsorName}>{s.campaign.name}</Primary></Td>
                {shortCell}
                <Td label="Approved substitute">
                  <span className="block text-[13px]">{chosen?.inventoryName ?? "—"}</span>
                  {chosen && <span className="block text-[11px] text-muted">{chosen.propertyName} · {signedUsd(chosen.costImpactCents)}</span>}
                </Td>
                <Td label="Approved by" muted>
                  {s.decision ? (
                    <>
                      {s.decision.by}
                      <span className="block text-[11px]">{dayLabel(s.decision.at)}</span>
                    </>
                  ) : "—"}
                </Td>
                <Td act><MakeGoodReview shortfall={s} sample={sample} /></Td>
              </Tr>
            );
          })}
        </PagedTable>
      )}
    </div>
  );
}
