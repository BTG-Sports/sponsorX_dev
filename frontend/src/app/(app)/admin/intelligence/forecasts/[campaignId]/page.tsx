import Link from "next/link";

import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { FigureTile, RiskBadge, StampLine, StatusChip } from "@/components/forecast-bits";
import { ForecastGuaranteeForm } from "@/components/forecast-guarantee-form";
import { ForecastPacingChart } from "@/components/forecast-pacing-chart";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { StageTable, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonChart, SkeletonRows } from "@/components/states";
import { Card, SourceLabel } from "@/components/ui";
import { demoState } from "@/lib/demo";
import {
  ACTION_WORD, METRIC_WORD, alertWords, canSetGuarantee, dayLabel, daysLeftWords, flightWords, fmtCount, paceWords, projectedShare, sampleForecastDetail,
  sampleHref, type ForecastDetail,
} from "@/lib/forecast-live";
import { pct, usd } from "@/lib/intelligence";
import { decidedByWords, decisionWords, heldReasons, runWords, type Shortfall } from "@/lib/makegood-live";
import { fetchActor } from "@/server/api";
import { readEngineItem, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   One campaign's forecast — 3S4-FE-01. The figures (verified delivery,
   projected final with its range, probability of the guarantee, the
   guarantee), the pacing chart (delivered vs plan, the projected band to
   the end date, the guarantee line), the alert when a risk threshold was
   crossed (3S4-BE-02 — raised before the end, and the page says how long
   before), the risk factors, the recommended actions (accelerate content,
   add a deliverable, change channel, reserve make-good inventory — the
   last links to the make-good centre for this campaign), and every past
   forecast so the model can be judged (acceptance #5).

   Reads  GET /intelligence/forecasts/:campaignId   (lib/forecast-live.ts)
   Writes PUT /intelligence/forecasts/:campaignId/guarantee (./../actions.ts)
          — the guarantee, for BTG admins and campaign managers
          (canSetGuarantee); Sales reads it.
   Pending engine → <EnginePending>; ?demo=sample (development only) → the
   sample campaign of that id, under a banner.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const LIST = "/admin/intelligence/forecasts";
const MAKE_GOODS = "/admin/intelligence/make-goods";
const TITLE = "Forecast";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function ForecastPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: SP }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonChart />
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(LIST);
  if (lacking) return <NotInRole path={LIST} title={TITLE} roles={lacking} />;
  const { campaignId } = await params;
  /* staffWithoutAccess let a demo viewer through unlinked: they can't set it. */
  const who = await fetchActor();
  const canSet = who.status === "linked" && canSetGuarantee(who.actor.roles);

  if (await wantsSample(searchParams)) {
    const d = sampleForecastDetail(campaignId);
    if (!d) return <Missing sample />;
    return <Forecast d={d} sample canSet={canSet} />;
  }

  const read = await readEngineItem<ForecastDetail>("forecast", `/intelligence/forecasts/${encodeURIComponent(campaignId)}`);
  if (read.state === "pending") {
    return (
      <div className="space-y-5">
        <Link href={LIST} className="text-xs text-muted hover:text-text">← Forecasts</Link>
        <h1 className="sx-page-title">{TITLE}</h1>
        <EnginePending engine={read.engine} />
      </div>
    );
  }
  if (read.state === "absent") return <Missing sample={false} />;
  return <Forecast d={read.data} sample={false} canSet={canSet} />;
}

function Missing({ sample }: { sample: boolean }) {
  return (
    <div className="space-y-5">
      <Link href={sampleHref(LIST, sample)} className="text-xs text-muted hover:text-text">← Forecasts</Link>
      <h1 className="sx-page-title">{TITLE}</h1>
      <EmptyState mark="inbox" title="No forecast matches this link" hint="The campaign may have ended, or the link is old." action={{ label: "Back to Forecasts", href: sampleHref(LIST, sample) }} />
    </div>
  );
}

/**
 * The campaign's make-goods (3S5-BE-02 adds `makeGoods` to this read for
 * those who may read them): what is open and held for a person, and what
 * was approved — by whom, and when it runs. The decisions themselves are
 * made in the make-good centre, which the link opens on this campaign.
 */
function MakeGoodsCard({ shortfalls, href }: { shortfalls: Shortfall[]; href: string }) {
  return (
    <Card className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Make-goods</h2>
        <Link href={href} className="text-[11px] font-medium text-primary-soft hover:underline">Open in the make-good centre →</Link>
      </div>
      {shortfalls.length ? (
        <ul className="space-y-2.5" aria-label="Make-goods for this campaign">
          {shortfalls.map((s) => {
            const held = heldReasons(s);
            return (
              <li key={s.id} className="text-xs">
                <span className="flex flex-wrap items-center gap-2">
                  <strong className="text-[13px] font-semibold text-text">
                    {fmtCount(s.shortfall)} {s.metric} short · {usd(s.shortfallValueCents)} at risk
                  </strong>
                  {s.decision ? <StatusChip tone="success">Approved</StatusChip> : held.length ? <StatusChip tone="warn">Held for a person</StatusChip> : <StatusChip tone="warn">Open</StatusChip>}
                </span>
                {s.decision ? (
                  <span className="text-muted">
                    {decisionWords(s.decision)}: {s.options.find((o) => o.id === s.decision?.optionId)?.inventoryName ?? "a substitute"} — {decidedByWords(s.decision)} · {dayLabel(s.decision.at)}
                    {runWords(s.decision) ? ` · ${runWords(s.decision)}` : ""}
                  </span>
                ) : (
                  <span className="text-muted">{held.length ? held[0] : "Waiting for a substitute to be picked."}</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted">None — nothing has fallen short of what was sold.</p>
      )}
    </Card>
  );
}

function Forecast({ d, sample, canSet }: { d: ForecastDetail; sample: boolean; canSet: boolean }) {
  const metric = METRIC_WORD[d.guarantee.metric];
  const now = new Date().getTime();
  const makeGoods = sampleHref(`${MAKE_GOODS}?campaign=${encodeURIComponent(d.campaignId)}`, sample);

  const historyColumns: Column[] = [
    { key: "at", label: "Forecast on" },
    { key: "mid", label: "Projected final", num: true },
    { key: "p", label: "Probability", num: true },
    { key: "model", label: "Model" },
  ];

  return (
    <div className="space-y-6">
      {sample && <SampleBanner />}
      <Link href={sampleHref(LIST, sample)} className="text-xs text-muted hover:text-text">← Forecasts</Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="sx-page-title">{d.campaignName}</h1>
          <p className="mt-1 text-xs text-muted">
            {d.sponsorName} · {flightWords(d)} · {daysLeftWords(d.endsAt, now)}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <RiskBadge risk={d.risk} />
            <StampLine stamp={d.stamp} />
          </p>
        </div>
      </div>

      {d.alert && (
        <p role="alert" className={`rounded-lg border px-3 py-2 text-xs font-medium ${d.alert.risk === "at_risk" ? "border-danger/40 bg-danger/10 text-danger" : "border-warn/40 bg-warn/10 text-warn"}`}>
          {alertWords(d.alert, d.endsAt)}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <FigureTile label="Delivered" value={fmtCount(d.delivered)} caption={`${metric} · ${paceWords(d)}`} extra={<SourceLabel source={d.deliveredSource} />} />
        <FigureTile label="Projected final" value={fmtCount(d.projectedFinal.mid)} caption={`range ${fmtCount(d.projectedFinal.low)} – ${fmtCount(d.projectedFinal.high)} · ${pct(projectedShare(d))} of guarantee`} extra={<SourceLabel source="ESTIMATED" />} />
        <FigureTile label="Probability of guarantee" value={pct(d.probabilityOfGuarantee)} caption={`by ${dayLabel(d.endsAt)}`} extra={<SourceLabel source="ESTIMATED" />} />
        <FigureTile label="Guarantee" value={fmtCount(d.guarantee.value)} caption={`${metric} promised by ${dayLabel(d.endsAt)}`} />
      </dl>

      <Card className="space-y-3 p-5">
        <div>
          <h2 className="text-sm font-semibold">Guarantee</h2>
          <p className="mt-0.5 text-[11px] text-muted">
            What this campaign is promised by its end date. Unset, the engine paces against every deliverable booked.
          </p>
        </div>
        <ForecastGuaranteeForm campaignId={d.campaignId} guarantee={d.guarantee} endsAt={d.endsAt} canSet={canSet} sample={sample} />
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Pacing</h2>
        {d.pacing.length ? (
          <ForecastPacingChart
            campaignName={d.campaignName}
            startsAt={d.startsAt}
            endsAt={d.endsAt}
            guarantee={d.guarantee}
            pacing={d.pacing}
            projection={d.projection}
          />
        ) : (
          <p className="text-xs text-muted">No verified delivery yet — pacing starts with the first measured day.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-5">
          <h2 className="text-sm font-semibold">Risk factors</h2>
          {d.riskFactors.length ? (
            <ul className="space-y-2.5">
              {d.riskFactors.map((f) => (
                <li key={f.key} className="text-xs">
                  <strong className="block text-[13px] font-semibold text-text">{f.label}</strong>
                  <span className="text-muted">{f.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted">None — the forecast found nothing holding this campaign back.</p>
          )}
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Recommended actions</h2>
            <Link href={makeGoods} className="inline-flex min-h-9 items-center rounded-lg border border-line px-3 text-xs font-medium text-text hover:bg-surface-2">
              Find make-goods →
            </Link>
          </div>
          {d.actions.length ? (
            <ol className="space-y-2.5">
              {d.actions.map((a, i) => (
                <li key={`${a.kind}-${i}`} className="text-xs">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-[13px] font-semibold text-text">{a.label || ACTION_WORD[a.kind]}</strong>
                    {a.kind === "reserve_make_good" && <StatusChip tone="warn">make-good</StatusChip>}
                  </span>
                  <span className="text-muted">{a.detail}</span>
                  {a.kind === "reserve_make_good" && (
                    <Link href={makeGoods} className="mt-1 block text-[11px] font-medium text-primary-soft hover:underline">See substitute inventory for this campaign</Link>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs text-muted">No action recommended — the campaign is pacing to its guarantee.</p>
          )}
        </Card>
      </div>

      {d.makeGoods !== undefined && <MakeGoodsCard shortfalls={d.makeGoods} href={makeGoods} />}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Forecast history</h2>
        {d.history.length ? (
          <StageTable label="Forecast history" columns={historyColumns}>
            {d.history.map((h, i) => (
              <Tr key={`${h.forecastAt}-${i}`} i={i}>
                <Td>{dayLabel(h.forecastAt)}</Td>
                <Td label="Projected final" num>{fmtCount(h.projectedMid)}</Td>
                <Td label="Probability" num>{pct(h.probability)}</Td>
                <Td label="Model" muted><code className="text-[11px]">{h.modelVersion}</code></Td>
              </Tr>
            ))}
          </StageTable>
        ) : (
          <p className="text-xs text-muted">This is the campaign&rsquo;s first forecast.</p>
        )}
      </section>
    </div>
  );
}
