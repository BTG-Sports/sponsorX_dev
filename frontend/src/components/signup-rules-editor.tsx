"use client";

import { useState, useTransition } from "react";

import { removeAgeRowAction, setAgeRowAction, setStaffConfirmAction, type RuleResult } from "@/app/(app)/admin/new-signups/rules/actions";

/* --------------------------------------------------------------------------
   2S1-FE-07 — the sign-up rules' controls (2S1-BE-10 / -12): the
   staff-confirmation switch, and the age-of-majority table's add / change /
   remove. Every change is the API's to accept (BTG admin only) and audit;
   the page re-reads after each.
   -------------------------------------------------------------------------- */

type Row = { id: string; countryCode: string; regionCode: string; age: number };
const field = "min-h-10 rounded-lg border border-line bg-bg px-3 text-sm text-text focus:border-primary/60 focus:outline-none";

function useRun() {
  const [result, setResult] = useState<RuleResult | null>(null);
  const [pending, start] = useTransition();
  const run = (f: () => Promise<RuleResult>) => start(async () => setResult(await f()));
  return { result, pending, run };
}

function Said({ r }: { r: RuleResult | null }) {
  if (!r) return null;
  return <p role={r.ok ? "status" : "alert"} className={`text-xs ${r.ok ? "text-success" : "text-danger"}`}>{r.message}</p>;
}

export function StaffConfirmSwitch({ on }: { on: boolean }) {
  const { result, pending, run } = useRun();
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input type="checkbox" checked={on} disabled={pending} onChange={(e) => run(() => setStaffConfirmAction(e.target.checked))} className="mt-0.5 size-4 accent-[var(--sx-primary)]" />
        <span>
          <strong className="font-semibold">BTG staff confirm minors before approval</strong>
          <span className="block text-xs text-muted">Off: a minor and their guardian are approved once every check passes. On: a complete minor waits under Needs review for a person.</span>
        </span>
      </label>
      <Said r={result} />
    </div>
  );
}

export function AgeRowForm() {
  const [c, setC] = useState("US");
  const [r, setR] = useState("");
  const [age, setAge] = useState("18");
  const { result, pending, run } = useRun();
  return (
    <form
      className="flex flex-wrap items-end gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setAgeRowAction({ countryCode: c, regionCode: r, age: Number(age) }));
      }}
    >
      <label className="flex flex-col text-xs font-medium">Country<input className={`${field} w-20`} value={c} maxLength={2} onChange={(e) => setC(e.target.value)} aria-describedby="age-hint" /></label>
      <label className="flex flex-col text-xs font-medium">State or province<input className={`${field} w-24`} value={r} maxLength={3} placeholder="All" onChange={(e) => setR(e.target.value)} /></label>
      <label className="flex flex-col text-xs font-medium">Age<input type="number" min={14} max={25} className={`${field} w-20`} value={age} onChange={(e) => setAge(e.target.value)} /></label>
      <button type="submit" disabled={pending} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-cta-ink hover:bg-primary-soft disabled:opacity-50">
        {pending ? "Saving…" : "Save place"}
      </button>
      <p id="age-hint" className="basis-full text-[11px] text-muted">Two-letter codes (US, AL). Leave the state empty for the whole country. Saving an existing place changes its age.</p>
      <div className="basis-full"><Said r={result} /></div>
    </form>
  );
}

export function RemoveAgeRow({ row }: { row: Row }) {
  const { result, pending, run } = useRun();
  const place = row.regionCode ? `${row.regionCode}, ${row.countryCode}` : row.countryCode;
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => run(() => removeAgeRowAction(row.id))} aria-label={`Remove ${place}`}
        className="min-h-9 rounded-lg border border-line px-3 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-50">
        Remove
      </button>
      {result && !result.ok && <Said r={result} />}
    </span>
  );
}
