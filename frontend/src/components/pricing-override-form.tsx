"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { overridePriceAction } from "@/app/(app)/admin/intelligence/pricing/actions";
import { cpm } from "@/lib/intelligence";
import { OVERRIDE_REASON_MAX, OVERRIDE_REASON_MIN, checkOverride, parseCpmInput } from "@/lib/pricing-live";

/* --------------------------------------------------------------------------
   3S2-FE-01 — the override control. A person's CPM and a required reason,
   saved as its OWN record beside a recommendation that never changes
   (Phase 3 acceptance #2). Disabled, with the reason why, when the API says
   this caller can't override (`canOverride`) or on the sample preview.
   The rules are lib/pricing-live.ts `checkOverride`, shown as you type; the
   server action re-checks them and the API has the last word.
   -------------------------------------------------------------------------- */

const inputCls =
  "mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs outline-none focus:border-admin/60 disabled:cursor-not-allowed disabled:opacity-60";

export function PricingOverrideForm({
  inventoryId,
  recommendationId,
  recommendedCpmCents,
  floorCpmCents,
  canOverride,
  sample = false,
}: {
  inventoryId: string;
  recommendationId: string;
  recommendedCpmCents: number;
  floorCpmCents: number | null;
  canOverride: boolean;
  sample?: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rec = { recommendedCpmCents, floorCpmCents };
  const check = checkOverride(price, reason, rec);
  const locked = !canOverride || sample;
  const typed = parseCpmInput(price);

  const submit = () => {
    setTouched(true);
    setError(null);
    setSaved(null);
    if (!check.ok || locked) return;
    start(async () => {
      const r = await overridePriceAction(inventoryId, recommendationId, rec, price, reason);
      if (!r.ok) {
        setError(r.message);
        return;
      }
      setSaved(`Override saved at ${cpm(check.cpmCents)} CPM. The recommendation is unchanged.`);
      setPrice("");
      setReason("");
      setTouched(false);
      router.refresh();
    });
  };

  return (
    <form
      aria-label="Override the recommended CPM"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {locked && (
        <p className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-[11px] text-muted">
          {sample ? "Sample preview — nothing here is saved." : "Overriding a recommended price needs the pricing-override permission. Ask a BTG admin."}
        </p>
      )}
      <fieldset disabled={locked || pending} className="m-0 min-w-0 space-y-3 border-0 p-0">
        <label className="block">
          <span className="text-[11px] font-medium text-muted">Your CPM, in dollars</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder={(recommendedCpmCents / 100).toFixed(2)}
            aria-describedby={`${id}-hint`}
            aria-invalid={touched && !check.ok && typed === "invalid"}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-muted">
            Reason <span className="text-faint">(required — kept with the override)</span>
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={OVERRIDE_REASON_MAX}
            placeholder="Why this price instead of the recommendation"
            aria-describedby={`${id}-hint`}
            className={`${inputCls} resize-none`}
          />
        </label>
        <p id={`${id}-hint`} aria-live="polite" className={`text-[10px] ${touched && !check.ok ? "text-danger" : "text-faint"}`}>
          {touched && !check.ok
            ? check.message
            : `Recommended ${cpm(recommendedCpmCents)}${floorCpmCents !== null ? ` · floor ${cpm(floorCpmCents)}` : ""} · reason ${reason.trim().length}/${OVERRIDE_REASON_MIN}+ characters.`}
        </p>
        <button
          type="submit"
          className="w-full rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save override"}
        </button>
      </fieldset>
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
