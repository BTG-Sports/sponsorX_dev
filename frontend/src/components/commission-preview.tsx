"use client";

import { useState, useTransition } from "react";

import { ComboBox } from "@/components/place-dialog";
import {
  PREVIEW_ROWS, PROPERTY_KINDS, toPreviewLines, usd, type PreviewResult, type RuleKind, type RuleScope, type SampleLine,
} from "@/lib/commission-live";

/* --------------------------------------------------------------------------
   The commission desk's sample order (P1-ART-19, 2S5-FE-01). A few lines —
   an item, its price, the kind of property selling it, whether it's an
   athlete's item — and the split the API works out for them, as the ledger
   design's waterfall: sale, the fees off the top, the property's share, what
   comes off that, and what the property can draw. Nothing is saved.

   The same lines feed the rule dialog's "Preview with this rule", which
   shows the split with and without the unsaved rule side by side.
   -------------------------------------------------------------------------- */

export const SAMPLE: SampleLine[] = [{ label: "Courtside banner", amount: "1200", propertyKind: "TEAM", athleteItem: false, teamShare: "" }];
const KIND_OPTIONS = PROPERTY_KINDS.map((k) => ({ code: k, name: k.charAt(0) + k.slice(1).toLowerCase() }));

export const field = "box-border min-h-10 w-full rounded-lg border border-[#63b4f8]/30 bg-[#04080f]/70 px-3 text-sm text-white placeholder:text-[#5b6b7d] focus:border-[#9be0ff] focus:outline-none";
export const fieldLabel = "mb-1 block text-[11px] font-medium text-[#8a96a3]";
export const btnPrimary = "inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
export const btnQuiet = "inline-flex min-h-10 items-center justify-center rounded-lg border border-[#63b4f8]/30 px-3.5 text-xs font-medium text-[#cfe9ff] hover:border-[#63b4f8]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export type PreviewFn = (input: {
  lines: Exclude<ReturnType<typeof toPreviewLines>, { ok: false }>["lines"];
  draft: { kind: RuleKind; scope: RuleScope; scopeRef: string | null; bps: number; fixedCents: number; priority: number } | null;
}) => Promise<{ ok: true; value: PreviewResult } | { ok: false; message: string }>;

export function SamplePanel({ lines, setLines, preview }: { lines: SampleLine[]; setLines: (l: SampleLine[]) => void; preview: PreviewFn }) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setLine = (i: number, patch: Partial<SampleLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const run = () => {
    const built = toPreviewLines(lines);
    if (!built.ok) return setMsg(built.message);
    start(async () => {
      const r = await preview({ lines: built.lines, draft: null });
      if (!r.ok) { setResult(null); return setMsg(r.message); }
      setMsg(null);
      setResult(r.value);
    });
  };

  return (
    <section aria-labelledby="sample-order" className="sx-card rounded-lg border border-line p-4 lg:sticky lg:top-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="sample-order" className="sx-section-title text-sm font-semibold">Try a sample order</h2>
          <p className="mt-1 text-[11px] text-muted">The split under the rules in effect, worked out exactly as at approval. Nothing is saved.</p>
        </div>
      </div>

      <ol className="mt-4 space-y-2.5">
        {lines.map((l, i) => (
          <li key={i} className="rounded-lg border border-[#63b4f8]/15 bg-[#04080f]/40 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] items-end gap-2">
              <label className="min-w-0">
                <span className={fieldLabel}>Item</span>
                <input className={field} value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} placeholder={`Line ${i + 1}`} />
              </label>
              <label>
                <span className={fieldLabel}>Sale ($)</span>
                <input className={`${field} text-right tabular-nums`} inputMode="decimal" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} placeholder="1200" />
              </label>
              <button type="button" onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`}
                className="grid size-10 place-items-center rounded-lg border border-[#63b4f8]/20 text-[#8a96a3] hover:text-white disabled:opacity-30">
                ×
              </button>
            </div>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <ComboBox label="Sold by" placeholder="Property type" options={KIND_OPTIONS} value={l.propertyKind} onPick={(code) => setLine(i, { propertyKind: code })} showCode={false} />
              <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[#63b4f8]/20 px-3 text-xs text-[#cfe9ff]">
                <input type="checkbox" className="accent-primary" checked={l.athleteItem} onChange={(e) => setLine(i, { athleteItem: e.target.checked })} />
                Athlete&rsquo;s item
              </label>
            </div>
            {l.athleteItem && (
              <label className="mt-2 block">
                <span className={fieldLabel}>Property&rsquo;s cut of it (%) — blank uses the rule</span>
                <input className={`${field} max-w-40`} inputMode="decimal" value={l.teamShare} onChange={(e) => setLine(i, { teamShare: e.target.value })} placeholder="20" />
              </label>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className={btnQuiet} onClick={() => setLines([...lines, { label: "", amount: "", propertyKind: "TEAM", athleteItem: false, teamShare: "" }])} disabled={lines.length >= 20}>
          + Add a line
        </button>
        <button type="button" className={`${btnPrimary} ml-auto`} onClick={run} disabled={pending}>{pending ? "Working it out…" : "Work out the split"}</button>
      </div>
      {msg && <p role="status" className="mt-2 text-xs text-danger">{msg}</p>}
      {result && (
        <div className="mt-4">
          <PreviewTable result={result} />
        </div>
      )}
    </section>
  );
}

/** The waterfall: one column per run (the rules in effect; with the unsaved rule), and the change between them. */
export function PreviewTable({ result }: { result: PreviewResult }) {
  const runs = [{ name: "In effect", run: result.current }, ...(result.withDraft ? [{ name: "With this rule", run: result.withDraft }] : [])];
  const two = runs.length === 2;
  return (
    <div className="overflow-x-auto rounded-lg border border-[#63b4f8]/20 bg-[#04080f]/50">
      <table className="w-full text-xs">
        <caption className="sr-only">The split of the sample order</caption>
        <thead>
          <tr className="border-b border-[#63b4f8]/20 text-[10px] uppercase tracking-[0.12em] text-[#8fb6d9]">
            <th scope="col" className="px-3 py-2 text-left font-semibold">Whole order</th>
            {runs.map((r) => <th key={r.name} scope="col" className="px-3 py-2 text-right font-semibold">{r.name}</th>)}
            {two && <th scope="col" className="px-3 py-2 text-right font-semibold">Change</th>}
          </tr>
        </thead>
        <tbody>
          {PREVIEW_ROWS.map((row) => {
            const a = runs[0]!.run.totals[row.key];
            const b = runs[1]?.run.totals[row.key];
            const off = row.key !== "netCents" && !row.strong;
            return (
              <tr key={row.key} className={`border-b border-[#63b4f8]/10 last:border-0 ${row.strong ? "bg-[#2e9bf5]/8" : ""}`}>
                <th scope="row" className={`px-3 py-1.5 text-left ${row.strong ? "font-semibold text-white" : "font-normal text-[#aab7c6]"}`}>
                  {off && <span aria-hidden="true" className="mr-1 text-[#5b6b7d]">−</span>}{row.label}
                </th>
                <td className={`px-3 py-1.5 text-right tabular-nums ${row.strong ? "font-semibold text-white" : "text-[#cfe9ff]"}`}>{usd(a)}</td>
                {b !== undefined && <td className={`px-3 py-1.5 text-right tabular-nums ${row.strong ? "font-semibold text-white" : "text-[#cfe9ff]"}`}>{usd(b)}</td>}
                {b !== undefined && (
                  <td className={`px-3 py-1.5 text-right tabular-nums ${b === a ? "text-[#5b6b7d]" : b > a ? "text-[#86efac]" : "text-[#fdba74]"}`}>
                    {b === a ? "—" : `${b > a ? "+" : "−"}${usd(Math.abs(b - a))}`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {runs[0]!.run.lines.some((l) => l.teamAvailableCents !== null) && (
        <p className="border-t border-[#63b4f8]/10 px-3 py-2 text-[11px] text-[#8a96a3]">
          Athlete items (in effect): {runs[0]!.run.lines.filter((l) => l.teamAvailableCents !== null).map((l) =>
            `${l.lineId} — property ${usd(l.teamAvailableCents!)}, athlete ${usd(l.availableCents - l.teamAvailableCents!)}`).join("; ")}.
        </p>
      )}
    </div>
  );
}
