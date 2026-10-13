import type { CSSProperties } from "react";

import { confidenceBand, confidenceLabel, cpm, signedPct, type ModelStamp } from "@/lib/intelligence";
import {
  factorWidth,
  rangeScale,
  rangeWords,
  rankFactors,
  smallSample,
  SMALL_SAMPLE,
  waterfall,
  type PricingFactor,
  type PricingOverride,
  type PricingRange,
} from "@/lib/pricing-live";

/* --------------------------------------------------------------------------
   3S2-FE-01 — the pricing panel's pieces. Server components (no hooks, no
   client JS): the desk table and the detail route render them straight.
   Theme tokens only, so they take on Mission Control's dark stage.

   Every figure here is the engine's (lib/pricing-live.ts): the bars are
   sized from the factors' own effects, the range from the engine's
   quartiles. Polarity is never colour alone — every push carries its sign
   and its words, and every mark has a title for hover.
   -------------------------------------------------------------------------- */

const BAND_CLS: Record<"high" | "medium" | "low", string> = {
  high: "border-accent/40 bg-accent/10 text-text",
  medium: "border-line bg-surface-2 text-text",
  low: "border-warn/40 bg-warn/10 text-warn",
};

/** "82% · high confidence" as a chip. */
export function ConfidenceChip({ confidence }: { confidence: number }) {
  const band = confidenceBand(confidence);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${BAND_CLS[band]}`}>
      {band === "low" && <span aria-hidden="true">!</span>}
      {confidenceLabel(confidence)}
    </span>
  );
}

/** Model version, confidence and when it was computed — on every recommendation. */
export function StampLine({ stamp, prefix }: { stamp: ModelStamp; prefix?: string }) {
  const at = new Date(stamp.computedAt);
  return (
    <p className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
      {prefix && <span className="text-faint">{prefix}</span>}
      <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-text">{stamp.modelVersion}</code>
      <ConfidenceChip confidence={stamp.confidence} />
      <span className="text-faint">
        computed {Number.isNaN(at.getTime()) ? stamp.computedAt : at.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" })} UTC
      </span>
    </p>
  );
}

/** Each factor's signed push, largest first, as a diverging bar about zero. */
export function FactorBars({ factors }: { factors: readonly PricingFactor[] }) {
  const ranked = rankFactors(factors);
  return (
    <ol className="space-y-3" aria-label="Factor breakdown, largest push first">
      {ranked.map((f) => {
        const w = factorWidth(f.effect, factors) / 2;
        const up = f.effect >= 0;
        const bar: CSSProperties = up ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` };
        return (
          <li key={f.key} className="grid gap-x-3 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)_7rem] sm:items-center">
            <span className="text-xs font-medium text-text">{f.label}</span>
            <span className="relative block h-3" title={`${f.label}: ${signedPct(f.effect)} (${up ? "+" : "−"}${cpm(Math.abs(f.impactCents))} CPM)`}>
              <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-line" />
              <span aria-hidden="true" className={`absolute top-0.5 h-2 rounded-full ${up ? "bg-accent" : "bg-danger"}`} style={bar} />
            </span>
            <span className="text-right text-xs tabular-nums text-text sm:text-right">
              <span className="font-semibold">{signedPct(f.effect)}</span>
              <span className="ml-1.5 text-muted">
                {up ? "+" : "−"}
                {cpm(Math.abs(f.impactCents))}
              </span>
            </span>
            <span className="text-[11px] leading-relaxed text-muted sm:col-span-3">{f.explanation}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Base → each factor → the recommendation, on one CPM scale. */
export function PriceWaterfall({ baseCents, recommendedCents, factors }: { baseCents: number; recommendedCents: number; factors: readonly PricingFactor[] }) {
  const steps = waterfall(baseCents, factors);
  const all = [baseCents, recommendedCents, ...steps.flatMap((s) => [s.fromCents, s.toCents])];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const lo = Math.max(0, min - Math.max(1, Math.round((max - min) * 0.5)));
  const span = max - lo || 1;
  const pos = (c: number) => ((c - lo) / span) * 100;
  const seg = (a: number, b: number): CSSProperties => ({ left: `${pos(Math.min(a, b))}%`, width: `${Math.max(0.8, pos(Math.max(a, b)) - pos(Math.min(a, b)))}%` });
  const row = (key: string, label: string, value: string, style: CSSProperties, cls: string, title: string) => (
    <li key={key} className="grid grid-cols-[7rem_minmax(0,1fr)_4.5rem] items-center gap-3">
      <span className="truncate text-[11px] text-muted">{label}</span>
      <span className="relative block h-3" title={title}>
        <span aria-hidden="true" className={`absolute top-0.5 h-2 rounded-full ${cls}`} style={style} />
      </span>
      <span className="text-right text-[11px] tabular-nums text-text">{value}</span>
    </li>
  );
  return (
    <ol className="space-y-1.5" aria-label="How the factors build the price">
      {row("__base", "Market base", cpm(baseCents), seg(lo, baseCents), "bg-faint/50", `Market base ${cpm(baseCents)} CPM`)}
      {steps.map((s) =>
        row(s.key, s.label, cpm(s.toCents), seg(s.fromCents, s.toCents), s.impactCents >= 0 ? "bg-accent" : "bg-danger", `${s.label}: ${cpm(s.fromCents)} → ${cpm(s.toCents)}`),
      )}
      {row("__rec", "Recommended", cpm(recommendedCents), seg(lo, recommendedCents), "bg-primary", `Recommended ${cpm(recommendedCents)} CPM`)}
    </ol>
  );
}

/** The comparable-sales range: p25–p75 band, the median, and where the
 *  current rate and the recommendation sit in it. */
export function RangeBar({ range, currentCents, recommendedCents }: { range: PricingRange; currentCents: number | null; recommendedCents: number }) {
  const s = rangeScale(range, [currentCents, recommendedCents]);
  const small = smallSample(range);
  const lo = s.at(range.p25Cents);
  const med = s.at(range.medianCents);
  const hi = s.at(range.p75Cents);
  const band: CSSProperties = { left: `${lo}%`, width: `${hi - lo}%` };
  const marker = (cents: number, label: string, cls: string) => (
    <span
      className="absolute top-0 -translate-x-1/2"
      style={{ left: `${s.at(cents)}%` }}
      title={`${label}: ${cpm(cents)} CPM — ${rangeWords(range, cents)}`}
    >
      <span aria-hidden="true" className={`block size-3 rounded-full ring-2 ring-surface ${cls}`} />
    </span>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span>
          {range.sampleSize.toLocaleString("en-US")} comparable sale{range.sampleSize === 1 ? "" : "s"} · {range.basis}
        </span>
        {small && (
          <span className="rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 font-medium text-warn">
            Small sample — fewer than {SMALL_SAMPLE}; read the range loosely
          </span>
        )}
      </div>
      {/* Each quartile is labelled AT its mark on the track, never in even
          columns that could be read against the wrong dot: the median above
          (clamped inside the track), the 25th ending at its tick, the 75th
          starting at its tick — so the two can never meet. */}
      <div>
        <div className="relative mb-1.5 h-4 text-[11px]">
          <span className="absolute bottom-0 w-28 text-center" style={{ left: `clamp(0px, calc(${med}% - 3.5rem), calc(100% - 7rem))` }}>
            <span className="text-faint">Median </span>
            <span className="tabular-nums text-text">{cpm(range.medianCents)}</span>
          </span>
        </div>
        <div className="relative h-3">
          <span aria-hidden="true" className="absolute inset-x-0 top-1 h-1 rounded-full bg-surface-2" />
          <span aria-hidden="true" className={`absolute top-0.5 h-2 rounded-full ${small ? "bg-warn/30" : "bg-primary/30"}`} style={band} />
          <span aria-hidden="true" className="absolute top-0 h-5 w-px -translate-x-1/2 bg-faint" style={{ left: `${lo}%` }} />
          <span aria-hidden="true" className="absolute top-0 h-5 w-px -translate-x-1/2 bg-faint" style={{ left: `${hi}%` }} />
          <span aria-hidden="true" className="absolute -top-0.5 h-4 w-0.5 -translate-x-1/2 rounded-full bg-primary" style={{ left: `${med}%` }} />
          {currentCents !== null && marker(currentCents, "Current", "bg-muted")}
          {marker(recommendedCents, "Recommended", "bg-accent")}
        </div>
        <div className="relative h-9 text-[11px]">
          <span className="absolute left-0 top-2 min-w-max pr-1.5 text-right" style={{ width: `${lo}%` }}>
            <span className="block text-faint">25th pct</span>
            <span className="block tabular-nums text-text">{cpm(range.p25Cents)}</span>
          </span>
          <span className="absolute right-0 top-2 min-w-max pl-1.5 text-left" style={{ width: `${100 - hi}%` }}>
            <span className="block text-faint">75th pct</span>
            <span className="block tabular-nums text-text">{cpm(range.p75Cents)}</span>
          </span>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-accent" />
          Recommended {cpm(recommendedCents)} — {rangeWords(range, recommendedCents)}
        </li>
        {currentCents !== null && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-muted" />
            Current {cpm(currentCents)} — {rangeWords(range, currentCents)}
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-primary" />
          Median
        </li>
      </ul>
    </div>
  );
}

/** Overrides, newest first — each its own record beside the recommendation. */
export function OverrideList({ overrides }: { overrides: readonly PricingOverride[] }) {
  if (overrides.length === 0) return <p className="text-[11px] text-faint">No overrides — the recommendation stands as computed.</p>;
  return (
    <ol className="divide-y divide-line-soft">
      {overrides.map((o) => (
        <li key={o.id} className="py-2.5">
          <p className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
            <span className="font-semibold tabular-nums text-text">{cpm(o.cpmCents)} CPM</span>
            <span className="text-[11px] text-faint">
              {o.by.name} · {new Date(o.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}
            </span>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">{o.reason}</p>
        </li>
      ))}
    </ol>
  );
}
