"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import {
  dollars,
  isTier,
  parseRateDollars,
  rateAdvice,
  rateRows,
  TIER_WORDS,
  TIERS,
  tierWords,
  type ApiRateEditor,
  type RateRow,
} from "@/lib/athlete-rates-live";

/* --------------------------------------------------------------------------
   POL-FE-51 — BTG's rate card editor, the interactive half. The tier first
   (a rate can't be saved without one), then every NIL job with the athlete's
   current rate and a Set / Change form. Before saving, the form says what the
   rate means for the sponsor price (rate × 1.4) and warns when no catalogue
   price for the job could clear it. Rates are typed in DOLLARS and sent in
   CENTS (lib/athlete-rates-live.ts). The API stays the gate; its refusals
   come back as words.
   -------------------------------------------------------------------------- */

type Result = { ok: true; message: string } | { ok: false; message: string };

export type RateCardActions = {
  saveRate: (athleteId: string, jobId: string, amountDollars: string, words: { athleteName: string; jobName: string }) => Promise<Result>;
  saveTier: (athleteId: string, tier: string) => Promise<Result>;
};

export function RateCardEditor({
  editor,
  openJob,
  studio,
  actions,
}: {
  editor: ApiRateEditor;
  /** The job to open on arrival — the Studio's "Set a rate" link names it. */
  openJob: string | null;
  /** Back to the Matching Studio's brief, when the editor was opened from it. */
  studio: string | null;
  actions: RateCardActions;
}) {
  const a = editor.athlete;
  const rows = rateRows(editor);
  const featured = a.state === "FEATURED";
  const tiered = isTier(a.tier);
  const [open, setOpen] = useState<string | null>(openJob && rows.some((r) => r.jobId === openJob) ? openJob : null);
  const [saved, setSaved] = useState<{ jobId: string; message: string } | null>(null);

  return (
    <div className="space-y-4">
      {featured && (
        <p role="note" className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2.5 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-warn">Featured, not represented. </span>
          A featured athlete holds no rates until they claim their profile and are activated.
        </p>
      )}

      {!featured && <TierCard athleteId={a.id} tier={a.tier} save={actions.saveTier} />}

      <Card className="p-0">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight">Rates by job</h2>
          <span className="text-[11px] text-muted">
            {rows.filter((r) => r.current).length} of {rows.length} set
          </span>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted">
            Your catalogue has no NIL jobs yet, so there is nothing to price.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((row) => (
              <RateRowItem
                key={row.jobId}
                row={row}
                athlete={{ id: a.id, name: a.displayName }}
                editable={!featured && tiered}
                open={open === row.jobId}
                onOpen={() => {
                  setSaved(null);
                  setOpen(row.jobId);
                }}
                onClose={() => setOpen(null)}
                saved={saved?.jobId === row.jobId ? saved.message : null}
                onSaved={(message) => {
                  setOpen(null);
                  setSaved({ jobId: row.jobId, message });
                }}
                studio={studio}
                save={actions.saveRate}
              />
            ))}
          </ul>
        )}
      </Card>

      {!featured && !tiered && rows.length > 0 && (
        <p className="text-[11px] text-faint">Rates open once the tier is set.</p>
      )}
    </div>
  );
}

function TierCard({ athleteId, tier, save }: { athleteId: string; tier: string | null; save: RateCardActions["saveTier"] }) {
  const router = useRouter();
  const tiered = isTier(tier);
  const [editing, setEditing] = useState(!tiered);
  const [pick, setPick] = useState<string>(tiered ? tier : "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => {
    setError(null);
    setDone(null);
    if (!isTier(pick)) return setError("Choose a tier first.");
    start(async () => {
      const r = await save(athleteId, pick);
      if (!r.ok) return setError(r.message);
      setDone(r.message);
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <Card>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Tier</h2>
        <Badge tone={tiered ? "primary" : "warn"}>{tierWords(tier)}</Badge>
        {tiered && !editing && (
          <button
            type="button"
            onClick={() => {
              setDone(null);
              setEditing(true);
            }}
            className="ml-auto rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-text"
          >
            Change tier
          </button>
        )}
      </div>
      {!tiered && (
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Set a tier before any rate. The tier is BTG&apos;s judgement of the athlete&apos;s level, and it is what each
          rate&apos;s sponsor price is checked against.
        </p>
      )}
      {editing && (
        <form
          className="mt-3 flex min-w-0 flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted">
            Tier
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="min-h-10 rounded-lg border border-line bg-bg px-3 text-[13px] text-text outline-none focus:border-primary"
            >
              <option value="" disabled>
                Choose…
              </option>
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {TIER_WORDS[t]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending || !pick || pick === tier}
            className="min-h-10 rounded-lg bg-primary px-4 text-[12px] font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save tier"}
          </button>
          {tiered && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
                setPick(tier);
              }}
              className="min-h-10 rounded-lg border border-line px-4 text-[12px] font-medium text-text hover:bg-surface-2"
            >
              Cancel
            </button>
          )}
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-3 text-xs text-accent">
          {done}
        </p>
      )}
    </Card>
  );
}

function RateRowItem({
  row,
  athlete,
  editable,
  open,
  onOpen,
  onClose,
  saved,
  onSaved,
  studio,
  save,
}: {
  row: RateRow;
  athlete: { id: string; name: string };
  editable: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  saved: string | null;
  onSaved: (message: string) => void;
  studio: string | null;
  save: RateCardActions["saveRate"];
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold tracking-tight [overflow-wrap:anywhere]">
            {row.jobId} · {row.name}
          </span>
          <span className="block text-[10px] text-muted">
            usual pay {dollars(row.payLow)}–{dollars(row.payHigh)} · sponsor price {dollars(row.sellLow)}–{dollars(row.sellHigh)}
          </span>
        </span>
        <span className="text-right">
          {row.current ? (
            <>
              <span className="block text-sm font-semibold tabular-nums">{dollars(row.current.amount)}</span>
              {row.current.version > 1 && <span className="block text-[10px] text-faint">version {row.current.version}</span>}
            </>
          ) : (
            <span className="block text-[11px] font-medium text-warn">No rate on file</span>
          )}
        </span>
        {editable && !open && (
          <button
            type="button"
            onClick={onOpen}
            className="min-h-9 rounded-lg border border-line px-3 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-text"
          >
            {row.current ? "Change" : "Set a rate"}
          </button>
        )}
      </div>
      {saved && (
        <div role="status" className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-accent">
          <span className="[overflow-wrap:anywhere]">{saved}</span>
          {studio && (
            <Link href={studio} className="font-medium text-text underline underline-offset-2 hover:no-underline">
              Back to the Matching Studio
            </Link>
          )}
        </div>
      )}
      {open && editable && <RateForm row={row} athlete={athlete} onClose={onClose} onSaved={onSaved} save={save} />}
    </li>
  );
}

function RateForm({
  row,
  athlete,
  onClose,
  onSaved,
  save,
}: {
  row: RateRow;
  athlete: { id: string; name: string };
  onClose: () => void;
  onSaved: (message: string) => void;
  save: RateCardActions["saveRate"];
}) {
  const router = useRouter();
  const [value, setValue] = useState(row.current ? String(row.current.amount / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const parsed = value.trim() ? parseRateDollars(value) : null;
  const advice = parsed?.ok ? rateAdvice(parsed.cents, row) : null;
  const unchanged = parsed?.ok && row.current?.amount === parsed.cents;
  const inputId = `rate-${row.jobId}`;

  const submit = () => {
    setError(null);
    const p = parseRateDollars(value);
    if (!p.ok) return setError(p.message);
    start(async () => {
      const r = await save(athlete.id, row.jobId, value, { athleteName: athlete.name, jobName: row.name });
      if (!r.ok) return setError(r.message);
      onSaved(r.message);
      router.refresh();
    });
  };

  return (
    <form
      className="mt-3 space-y-2.5 rounded-lg border border-line-soft bg-surface-2/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={inputId} className="block text-[11px] font-medium text-muted">
        {athlete.name}&apos;s rate for {row.name}, in dollars
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="flex min-w-0 items-center rounded-lg border border-line bg-bg focus-within:border-primary">
          <span aria-hidden="true" className="pl-3 text-[13px] text-faint">$</span>
          <input
            id={inputId}
            // The Studio's "Set a rate" link opens this form; put the cursor where the work is.
            autoFocus
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder={String(row.payLow / 100)}
            aria-describedby={`${inputId}-advice`}
            className="min-h-10 w-32 bg-transparent px-2 text-[13px] tabular-nums outline-none"
          />
        </span>
        <button
          type="submit"
          disabled={pending || !parsed?.ok || unchanged === true}
          className="min-h-10 rounded-lg bg-primary px-4 text-[12px] font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save rate"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 rounded-lg border border-line px-4 text-[12px] font-medium text-text hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>
      <div id={`${inputId}-advice`} className="space-y-1 text-[11px] leading-relaxed">
        {parsed && !parsed.ok && <p className="text-warn">{parsed.message}</p>}
        {advice && <p className="text-muted">{advice.floor}</p>}
        {advice?.note && <p className="text-faint">{advice.note}</p>}
        {advice?.warning && <p className="font-medium text-warn">{advice.warning}</p>}
        {unchanged && <p className="text-faint">That is the current rate already.</p>}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
