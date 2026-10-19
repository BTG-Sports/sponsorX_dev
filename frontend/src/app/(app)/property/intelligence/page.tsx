import Link from "next/link";

import { HBarList } from "@/components/charts";
import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { EmptyState, SkeletonPage } from "@/components/states";
import { Badge, Card, Meter, SectionHeading, SourceLabel } from "@/components/ui";
import { demoState } from "@/lib/demo";
import { confidenceBand, confidenceLabel, cpm, pct, signedPct, usd, type ModelStamp } from "@/lib/intelligence";
import {
  PROPERTY_INTEL_PATH,
  SAMPLE_PROPERTY_INTEL,
  categoryWord,
  confidenceShort,
  fitWord,
  formatWord,
  overallSellThrough,
  qualityBand,
  rankFit,
  rankRates,
  rateChange,
  splitSellThrough,
  type PropertyIntel,
} from "@/lib/property-intelligence-live";
import { apiFetch } from "@/server/api";
import { readEngine, wantsSample } from "@/server/engine";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Property intelligence hub — 3S7-FE-02, the property portal's look (cards,
   tiles and section headings like Analytics). What the property could
   charge and what it is leaving unsold: rate recommendations against the
   current CPM, open opportunity, sell-through by format, which sponsor
   categories fit and an inventory quality score.

   Reads GET /intelligence/property   (mounted 2026-10-15 by 3S7-BE-02;
                                       lib/property-intelligence-live.ts has
                                       the contract, documentation/SponsorX-
                                       Hub-Intelligence.md §2 the rules)
         GET /properties/mine         404 = no property on this login
   Scoped by the API to the manager's own property.

   Decided 2026-10-13, "FE only, honest empty states": a tenant whose hub is
   switched off gets the heading and <EnginePending> — no figure at all.
   A real API failure throws to the error boundary. ?demo=sample (dev only)
   previews the live layout from SAMPLE_PROPERTY_INTEL under a banner;
   ?demo=loading|empty|error render the branded states.

   Every model figure prints its confidence; the open opportunity is an
   estimate and is labelled one. Category fit lists every brand category,
   and one that fits 0 (restricted, or age-gated for a school) prints the
   engine's reason. Nothing here edits a price — the manager changes it in
   Inventory.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;

const heading = (
  <div>
    <h1 className="text-xl font-semibold tracking-tight">Intelligence</h1>
    <p className="mt-1 text-xs text-muted">What your inventory could earn: rate recommendations, open opportunity and how it&rsquo;s selling. Model figures show how sure they are.</p>
  </div>
);

export default async function PropertyIntelligencePage({ searchParams }: { searchParams: SP }) {
  await requirePortalAccess("property");
  const demo = await demoState(searchParams);
  if (demo === "loading") return <SkeletonPage />;
  if (demo === "error") throw new Error("Demo error state");
  if (demo === "empty") return <NoInventory />;

  if (await wantsSample(searchParams)) {
    return (
      <div className="space-y-6">
        <SampleBanner />
        {heading}
        <Hub d={SAMPLE_PROPERTY_INTEL} />
      </div>
    );
  }

  /* The engine read and the property check together; a login with no
     property gets the portal's usual answer, not the engine's error. */
  const [mineRes, read] = await Promise.all([
    apiFetch("/properties/mine"),
    readEngine<PropertyIntel>("propertyHub", PROPERTY_INTEL_PATH).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
  ]);
  if (mineRes.status === 404) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="chart" title="No property is linked to this login" hint="Intelligence belongs to a property's manager. Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (read instanceof Error) throw read;
  if (read.state === "pending") {
    return (
      <div className="space-y-6">
        {heading}
        <EnginePending engine={read.engine} audience="property" />
      </div>
    );
  }
  if (read.data.rates.length === 0 && read.data.sellThrough.length === 0) return <NoInventory />;
  return (
    <div className="space-y-6">
      {heading}
      <Hub d={read.data} />
    </div>
  );
}

function NoInventory() {
  return (
    <div className="space-y-6">
      {heading}
      <EmptyState
        mark="chart"
        title="No inventory to price yet"
        hint="Rate recommendations and sell-through appear once you have items in Inventory."
        action={{ label: "Add inventory", href: "/property/inventory" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- the page */

const BAND_TONE = { high: "accent", medium: "primary", low: "warn" } as const;

/** The confidence pill, always on one line. `short` drops the word
 *  "confidence" where it is already on screen (the rate table's header or
 *  its mobile prefix); the full wording stays in the accessible name. */
function Confidence({ stamp, short = false }: { stamp: ModelStamp; short?: boolean }) {
  const full = confidenceLabel(stamp.confidence);
  return (
    <span className="inline-block whitespace-nowrap" title={`${full} · model ${stamp.modelVersion}`}>
      <Badge tone={BAND_TONE[confidenceBand(stamp.confidence)]}>
        {short ? (
          <>
            {confidenceShort(stamp.confidence)}
            <span className="sr-only"> confidence</span>
          </>
        ) : (
          full
        )}
      </Badge>
    </span>
  );
}

function Hub({ d }: { d: PropertyIntel }) {
  const sell = overallSellThrough(d.sellThrough);
  const sellRows = splitSellThrough(d.sellThrough);
  const rates = rankRates(d.rates);
  const up = rates.filter((r) => (rateChange(r) ?? 0) > 0).length;
  const down = rates.filter((r) => (rateChange(r) ?? 0) < 0).length;
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="flex items-center justify-between gap-2 text-[11px] text-muted">
            Open opportunity
            <SourceLabel source={d.opportunity.provenance} />
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{usd(d.opportunity.openValueCents)}</p>
          <p className="mt-0.5 text-[11px] text-faint">
            {d.opportunity.unsoldItems === 0
              ? "Every active item sold in the last 12 months"
              : `${d.opportunity.unsoldItems.toLocaleString("en-US")} ${d.opportunity.unsoldItems === 1 ? "item" : "items"} with no sale in 12 months, at listed price`}
          </p>
        </li>
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="flex items-center justify-between gap-2 text-[11px] text-muted">
            Sell-through
            <SourceLabel source="VERIFIED_SYSTEM" />
          </p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{sell.rate === null ? "—" : pct(sell.rate)}</p>
          <p className="mt-0.5 text-[11px] text-faint">
            {sell.listed === 0 ? "No active items yet" : `${sell.sold.toLocaleString("en-US")} of ${sell.listed.toLocaleString("en-US")} items sold in 12 months`}
          </p>
        </li>
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11px] text-muted">Quality score</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {Math.round(d.quality.score)}
            <span className="text-sm font-normal text-muted"> / 100</span>
          </p>
          {/* The pill sits on the caption line, not beside the label, so neither is squeezed onto two lines. */}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-faint">
            {qualityBand(d.quality.score)}
            <Confidence stamp={d.quality.stamp} />
          </p>
        </li>
        <li className="rounded-xl border border-line bg-surface p-4">
          <p className="text-[11px] text-muted">Rate recommendations</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{rates.length.toLocaleString("en-US")}</p>
          <p className="mt-0.5 text-[11px] text-faint">
            {up} to raise · {down} to lower
          </p>
        </li>
      </ul>

      <Rates rates={rates} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading title="Sell-through by type" hint="Items with a sale in the last 12 months, against the active items you have of that kind — yours and your roster's." />
          <Card>
            {sellRows.rated.length === 0 && sellRows.unlisted.length === 0 ? (
              <p className="text-xs text-muted">No active items yet. Sell-through appears once you have items in Inventory.</p>
            ) : (
              <>
                {sellRows.rated.length > 0 && (
                  <HBarList
                    rows={sellRows.rated.map((s) => ({
                      id: s.format,
                      label: formatWord(s.format),
                      value: Math.round(s.rate * 100),
                      display: `${s.sold.toLocaleString("en-US")} of ${s.listed.toLocaleString("en-US")} · ${pct(s.rate)}`,
                      tone: s.rate < 0.25 ? "warn" : undefined,
                    }))}
                  />
                )}
                {/* No rate, no bar: a format with nothing listed is a muted text row. */}
                {sellRows.unlisted.length > 0 && (
                  <ul className={`space-y-1.5 text-[11px] ${sellRows.rated.length > 0 ? "mt-3 border-t border-line-soft pt-3" : ""}`}>
                    {sellRows.unlisted.map((s) => (
                      <li key={s.format} className="flex items-baseline justify-between gap-2 text-faint">
                        <span className="min-w-0 truncate">{formatWord(s.format)}</span>
                        <span className="shrink-0">No active items</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>
        </section>

        <section>
          <SectionHeading
            title="Sponsor categories that fit you"
            hint="Every brand category, by what you list for it and the sales you have made to its brands in the last 12 months. A category you have restricted, or one that is age-gated for a school, is not a fit and says why. A model's view, with its confidence."
          />
          <Card className="space-y-3">
            <div className="flex justify-end">
              <Confidence stamp={d.categoryFit.stamp} />
            </div>
            {d.categoryFit.categories.length === 0 ? (
              <p className="text-xs text-muted">No categories scored yet.</p>
            ) : (
              <ul className="space-y-3">
                {rankFit(d.categoryFit.categories).map((c) => (
                  <li key={c.category} className={c.fit <= 0 ? "opacity-80" : undefined}>
                    <div className="flex items-baseline justify-between gap-2 text-xs">
                      <span className="font-medium">{categoryWord(c.category)}</span>
                      <span className="tabular-nums text-muted">{fitWord(c.fit)}</span>
                    </div>
                    <div className="mt-1">
                      <Meter value={c.fit * 100} />
                    </div>
                    <p className="mt-1 text-[11px] text-faint">{c.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <section>
        <SectionHeading title="Quality breakdown" hint="What makes up your quality score. Raise a part and the score follows." />
        <Card>
          {d.quality.components.length === 0 ? (
            <p className="text-xs text-muted">No parts scored yet.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {d.quality.components.map((q) => (
                <li key={q.label}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium">{q.label}</span>
                    <span className="tabular-nums text-muted">{Math.round(q.score)} / 100</span>
                  </div>
                  <div className="mt-1">
                    <Meter value={q.score} tone="accent" />
                  </div>
                  <p className="mt-1 text-[11px] text-faint">{q.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </>
  );
}

/* -------------------------------------------------------- rate table */

function Rates({ rates }: { rates: PropertyIntel["rates"] }) {
  const cols = "sm:grid-cols-[minmax(0,1fr)_5.5rem_7rem_4.5rem_7.5rem]";
  /* Capped at max-w-5xl: on a wide screen an uncapped item column ran
     ~1100px and stranded the figures at the far edge, away from their item.
     The heading is local, not <SectionHeading action>, so the link can
     stack under the description on a phone instead of squeezing it. */
  return (
    <section className="max-w-5xl">
      <div className="mb-3 flex flex-col gap-1.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h2 className="sx-section-title text-sm font-semibold tracking-tight">Rate recommendations</h2>
          <p className="mt-0.5 text-xs text-muted">
            What each of your roster&rsquo;s items could charge per 1,000 people reached, and what moved the price. Nothing here changes a price for you.
          </p>
        </div>
        <Link href="/property/inventory" className="shrink-0 self-start text-xs font-medium text-accent hover:text-accent-soft sm:self-auto">
          Change a price in Inventory →
        </Link>
      </div>
      {rates.length === 0 ? (
        <EmptyState
          mark="chart"
          title="No recommendations yet"
          hint="SponsorX prices your roster athletes' items; a suggestion appears here for each of theirs once it has priced them."
        />
      ) : (
        <Card className="p-0">
          <div className={`hidden gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint sm:grid ${cols}`}>
            <span>Item</span>
            <span className="text-right">Current CPM</span>
            <span className="text-right">Recommended</span>
            <span className="text-right">Change</span>
            <span className="text-right">Confidence</span>
          </div>
          <ul className="divide-y divide-line-soft">
            {rates.map((r) => {
              const change = rateChange(r);
              return (
                <li key={r.inventoryId} className="px-4 py-3 text-xs">
                  <div className={`grid grid-cols-2 items-center gap-x-3 gap-y-1 tabular-nums ${cols}`}>
                    <span className="col-span-2 min-w-0 sm:col-span-1">
                      <span className="block truncate font-medium">{r.name}</span>
                      <span className="block text-[11px] text-muted">{formatWord(r.format)}</span>
                    </span>
                    <span className="text-muted sm:text-right">
                      <span className="text-[10px] text-faint sm:hidden">Now </span>
                      {r.currentCpmCents === null ? "Not set" : cpm(r.currentCpmCents)}
                    </span>
                    <span className="text-right font-medium">
                      <span className="text-[10px] font-normal text-faint sm:hidden">Recommended </span>
                      {cpm(r.recommendedCpmCents)}
                    </span>
                    <span className={`sm:text-right ${change === null ? "text-faint" : change > 0 ? "text-success" : change < 0 ? "text-warn" : "text-muted"}`}>
                      {change === null ? "—" : signedPct(change)}
                    </span>
                    <span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5">
                      <span aria-hidden="true" className="text-[10px] text-faint sm:hidden">
                        Confidence
                      </span>
                      <Confidence stamp={r.stamp} short />
                    </span>
                  </div>
                  {r.topFactors.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={`What moved the price of ${r.name}`}>
                      {r.topFactors.map((f) => (
                        <li key={f.label} className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                          {f.label}
                          {f.effect !== 0 && <span className="ml-1 tabular-nums text-faint">{signedPct(f.effect)}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </section>
  );
}
