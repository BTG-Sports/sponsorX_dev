"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setGuaranteeAction } from "@/app/(app)/admin/intelligence/forecasts/actions";
import { GUARANTEE_METRICS, METRIC_WORD, checkGuarantee, guaranteeWords, type GuaranteeMetric } from "@/lib/forecast-live";

/* --------------------------------------------------------------------------
   3S4-FE-01 — the guarantee control. What the campaign is promised by its
   end date: a metric and how many, or the default (every deliverable
   booked). Saved through PUT …/guarantee; the API decides who may (BTG
   admins and campaign managers — `canSet`) and audits it. The forecast is
   made nightly, so the figures above keep tonight's guarantee until the
   next run — the form says so rather than pretend the page re-paced.
   Disabled, with the reason, for a role that reads or on the sample preview.
   -------------------------------------------------------------------------- */

const inputCls =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-admin/60 disabled:cursor-not-allowed disabled:opacity-60";

export function ForecastGuaranteeForm({
  campaignId,
  guarantee,
  endsAt,
  canSet,
  sample = false,
}: {
  campaignId: string;
  /** The guarantee the latest forecast paced against. */
  guarantee: { metric: GuaranteeMetric; value: number };
  endsAt: string;
  canSet: boolean;
  sample?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [metric, setMetric] = useState<string>(guarantee.metric);
  const [value, setValue] = useState(String(guarantee.value));
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const check = checkGuarantee(metric, value);
  const locked = !canSet || sample;

  const submit = () => {
    setTouched(true);
    setError(null);
    setSaved(null);
    if (!check.ok || locked) return;
    start(async () => {
      const r = await setGuaranteeAction(campaignId, metric, value);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setSaved(`Saved: ${guaranteeWords(r.guarantee, endsAt)} Tonight's forecast paces against it; the figures above are still today's.`);
      setTouched(false);
      router.refresh();
    });
  };

  return (
    <form
      aria-label="Set the campaign's guarantee"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {locked && (
        <p className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
          {sample ? "Sample preview — nothing here is saved." : "Guarantees are set by BTG admins and campaign managers. Your role reads the forecast."}
        </p>
      )}
      <fieldset disabled={locked || pending} className="m-0 grid min-w-0 gap-3 border-0 p-0 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block">
          <span className="text-[11px] font-medium text-muted">Promised</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className={inputCls} aria-describedby={`${id}-hint`}>
            <option value="">Every deliverable booked (default)</option>
            {GUARANTEE_METRICS.map((m) => (
              <option key={m} value={m}>
                {METRIC_WORD[m].charAt(0).toUpperCase() + METRIC_WORD[m].slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-muted">How many, by the end date</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="numeric"
            disabled={!metric}
            placeholder={metric ? "e.g. 500,000 or 500k" : "not needed for the default"}
            aria-describedby={`${id}-hint`}
            aria-invalid={touched && !check.ok}
            className={inputCls}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save guarantee"}
        </button>
      </fieldset>
      <p id={`${id}-hint`} aria-live="polite" className={`text-[10px] ${touched && !check.ok ? "text-danger" : "text-faint"}`}>
        {touched && !check.ok ? check.message : "Applies from tonight's forecast. Audited, with who set it."}
      </p>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="rounded-lg border border-accent/30 bg-accent/8 px-3 py-2 text-[11px] text-text">
          {saved}
        </p>
      )}
    </form>
  );
}
