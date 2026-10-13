import Link from "next/link";

import { EnginePending, SampleBanner } from "@/components/engine-pending";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { FactorBars, OverrideList, PriceWaterfall, RangeBar, StampLine } from "@/components/pricing-panel";
import { PricingOverrideForm } from "@/components/pricing-override-form";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { cpm, usd } from "@/lib/intelligence";
import { deltaOf, kindLabel, reconciles, sampleDetail, type PricingDetail } from "@/lib/pricing-live";
import { readEngineItem, wantsSample } from "@/server/engine";

/* --------------------------------------------------------------------------
   The pricing panel for one inventory item — 3S2-FE-01 (Spec §16 P3-01,
   Phase 3 acceptance #1 and #2).

   Recommended CPM against the current rate; every factor that moved it,
   signed and explained, and how they build from the market base to the
   price; the model version and confidence; the historical range with its
   sample size (flagged when small); and the override control. An override
   is its own record listed under a recommendation that never changes.

   Reads  GET  /intelligence/pricing/:inventoryId   (3S2-BE-02 / -03)
   Writes POST /intelligence/pricing/recommendations/:id/overrides  (./../actions.ts)
   Proposed contract: lib/pricing-live.ts. Engine not mounted → <EnginePending>.
   ?demo=sample previews on sampleDetail(id) (dev only); ?demo=loading|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/intelligence/pricing";
/** The pending / absent title — never "Pricing", which is the back link's word for the desk. */
const TITLE = "Pricing recommendation";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function PricingItemPage({ params, searchParams }: { params: Promise<{ inventoryId: string }>; searchParams: SP }) {
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
  const { inventoryId } = await params;

  const back = (sample: boolean) => (
    <Link href={sample ? `${PATH}?demo=sample` : PATH} className="text-xs text-muted hover:text-text">
      ← Pricing
    </Link>
  );

  if (await wantsSample(searchParams)) {
    return (
      <div className="space-y-5">
        <SampleBanner />
        {back(true)}
        <Panel d={sampleDetail(inventoryId)} sample />
      </div>
    );
  }

  const read = await readEngineItem<PricingDetail>("pricing", `/intelligence/pricing/${encodeURIComponent(inventoryId)}`);
  if (read.state === "pending") {
    return (
      <div className="space-y-5">
        {back(false)}
        <h1 className="sx-page-title">{TITLE}</h1>
        <EnginePending engine={read.engine} />
      </div>
    );
  }
  if (read.state === "absent") {
    return (
      <div className="space-y-5">
        {back(false)}
        <h1 className="sx-page-title">{TITLE}</h1>
        <EmptyState mark="inbox" title="No recommendation for this item" hint="The item may have been withdrawn, or the link is old." action={{ label: "Back to Pricing", href: "/admin/intelligence/pricing" }} />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {back(false)}
      <Panel d={read.data} />
    </div>
  );
}

function Panel({ d, sample = false }: { d: PricingDetail; sample?: boolean }) {
  const rec = d.recommendation;
  const delta = deltaOf(rec.currentCpmCents, rec.recommendedCpmCents);
  const sums = reconciles(rec);
  const section = "rounded-xl border border-line bg-surface p-4 sm:px-5";
  const latest = d.overrides[0];

  return (
    <>
      <div className="space-y-1.5">
        <h1 className="sx-page-title">{d.inventory.title}</h1>
        <p className="text-xs text-muted">
          {kindLabel(d.inventory.kind)} · {d.inventory.seller.name}
          {d.inventory.seller.kind === "PROPERTY" ? " (property)" : " (athlete)"}
          {d.inventory.priceCents > 0 && <> · listed at {usd(d.inventory.priceCents)}</>}
        </p>
        <StampLine stamp={rec.stamp} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          <section aria-label="Recommended against current" className={`${section} grid gap-4 sm:grid-cols-3`}>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Recommended CPM</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{cpm(rec.recommendedCpmCents)}</p>
              <p className="text-[11px] text-faint">immutable · {rec.id}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Current CPM</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-muted">{rec.currentCpmCents === null ? "—" : cpm(rec.currentCpmCents)}</p>
              <p className="text-[11px] text-faint">{rec.currentCpmCents === null ? "no delivery history to imply one" : "implied by the listed price"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-faint">Against current</p>
              {/* The figure big like its neighbours, the words under it — "13% above the current rate" in one line orphaned "rate" at laptop width. */}
              <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${delta.direction === "up" ? "text-accent" : delta.direction === "down" ? "text-danger" : "text-muted"}`}>
                {delta.fraction === null ? "—" : `${delta.direction === "up" ? "▲ " : delta.direction === "down" ? "▼ " : ""}${Math.round(Math.abs(delta.fraction) * 100)}%`}
              </p>
              <p className="text-[11px] text-faint">
                {delta.direction === "none" ? "no current rate to compare" : delta.direction === "flat" ? "at the current rate" : `${delta.direction === "up" ? "above" : "below"} the current rate`}
              </p>
              <p className="text-[11px] text-faint">{rec.floorCpmCents === null ? "no sell floor applies" : `never below the ${cpm(rec.floorCpmCents)} floor`}</p>
            </div>
          </section>

          <section aria-label="Factor breakdown" className={`${section} space-y-4`}>
            <div>
              <h2 className="text-sm font-semibold">What moved the price</h2>
              <p className="mt-0.5 text-[11px] text-muted">Each factor&rsquo;s push on the market base, largest first.</p>
            </div>
            {rec.factors.length === 0 ? (
              <p className="text-[11px] text-faint">The engine sent no factors for this recommendation — it can&rsquo;t be explained, so don&rsquo;t quote it.</p>
            ) : (
              <>
                <FactorBars factors={rec.factors} />
                <div className="border-t border-line-soft pt-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">From base to price</p>
                  <PriceWaterfall baseCents={rec.baseCpmCents} recommendedCents={rec.recommendedCpmCents} factors={rec.factors} />
                </div>
              </>
            )}
            {!sums.ok && (
              <p role="note" className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[11px] text-warn">
                The factors don&rsquo;t add up to the recommendation — {cpm(Math.abs(sums.gapCents))} {sums.gapCents > 0 ? "unexplained above" : "unexplained below"} them. Report it to the
                engine&rsquo;s owner before quoting this price.
              </p>
            )}
          </section>

          <section aria-label="Historical range" className={`${section} space-y-3`}>
            <h2 className="text-sm font-semibold">Historical range</h2>
            {rec.range ? (
              <RangeBar range={rec.range} currentCents={rec.currentCpmCents} recommendedCents={rec.recommendedCpmCents} />
            ) : (
              <p className="text-[11px] text-faint">No comparable sales yet — there is no range to compare against.</p>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section aria-label="Override" className={`${section} space-y-3`}>
            <div>
              <h2 className="text-sm font-semibold">Override</h2>
              <p className="mt-0.5 text-[11px] text-muted">
                Saved as its own record with your reason. The recommendation above is never edited.
                {latest && <> In force now: <span className="font-medium text-text">{cpm(latest.cpmCents)}</span>.</>}
              </p>
            </div>
            <PricingOverrideForm
              inventoryId={d.inventory.id}
              recommendationId={rec.id}
              recommendedCpmCents={rec.recommendedCpmCents}
              floorCpmCents={rec.floorCpmCents}
              canOverride={d.canOverride}
              sample={sample}
            />
          </section>
          <section aria-label="Override records" className={`${section} space-y-2`}>
            <h2 className="text-sm font-semibold">
              Override records <span className="text-[11px] font-normal text-faint">· {d.overrides.length}</span>
            </h2>
            <OverrideList overrides={d.overrides} />
          </section>
        </aside>
      </div>
    </>
  );
}
