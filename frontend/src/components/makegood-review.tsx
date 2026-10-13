"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { approveMakeGoodAction } from "@/app/(app)/admin/intelligence/make-goods/actions";
import { CloseIcon } from "@/components/filter-kit";
import { StampLine, StatusChip } from "@/components/forecast-bits";
import { DialogError, NoteField, btn } from "@/components/order-dialog";
import { Meter } from "@/components/ui";
import { useDialogFocus } from "@/components/use-dialog-focus";
import { useMounted } from "@/components/use-mounted";
import { METRIC_WORD, dayLabel, fmtCount } from "@/lib/forecast-live";
import { MIN_REASON } from "@/lib/intel-admin";
import { pct, usd } from "@/lib/intelligence";
import {
  CHECKS, approvalBlock, approvalError, bestOption, costWords, coverage, decidedOption, equivalencyLabel, shortfallShare, signedUsd,
  type MakeGoodOption, type Shortfall,
} from "@/lib/makegood-live";

/* --------------------------------------------------------------------------
   3S5-FE-01 — one shortfall's substitutes, in a drawer opened from its row.

   The shortfall (sold, projected, short, value short, the model's stamp),
   then every option side by side: equivalency score, cost impact, how much
   of the gap it covers, the three checks of acceptance #7 (available,
   clear of exclusivity, on target) and the engine's reason. An option
   failing any check shows why and has no approve button that works. Picking
   one opens the approve form under the options: a required note, then
   approveMakeGoodAction → POST /intelligence/make-goods/:id/approve.

   A decided shortfall is read-only: the approved option marked, who, when
   and their note. In the `?demo=sample` preview the form never sends.
   -------------------------------------------------------------------------- */

const trigger =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg px-3.5 text-sm font-semibold md:min-h-9 md:w-auto md:text-xs";

export function MakeGoodReview({ shortfall, sample }: { shortfall: Shortfall; sample: boolean }) {
  const [open, setOpen] = useState(false);
  const decided = Boolean(shortfall.decision);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${decided ? "View" : "Review"} make-good options for ${shortfall.campaign.name}`}
        className={`${trigger} ${decided ? "border border-line font-medium text-text hover:bg-surface-2" : "bg-primary text-cta-ink hover:bg-primary-soft"}`}
      >
        {decided ? "View" : "Review options →"}
      </button>
      {open && <Drawer s={shortfall} sample={sample} onClose={() => setOpen(false)} />}
    </>
  );
}

function Drawer({ s, sample, onClose }: { s: Shortfall; sample: boolean; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const mounted = useMounted();
  const router = useRouter();
  const [picked, setPicked] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!mounted) return null;

  const best = bestOption(s.options);
  const chosen = decidedOption(s);
  const pickedOption = s.options.find((o) => o.id === picked) ?? null;
  const metric = METRIC_WORD[s.metric];
  const titleId = `mg-${s.id}-title`;

  const submit = () => {
    if (!pickedOption) return;
    setError(null);
    const block = approvalBlock(s, pickedOption);
    if (block) return setError(block);
    const invalid = approvalError({ optionId: pickedOption.id, note });
    if (invalid) return setError(invalid);
    if (sample) return setError("Sample preview — nothing is sent.");
    start(async () => {
      const res = await approveMakeGoodAction(s.id, { optionId: pickedOption.id, note: note.trim() });
      if (!res.ok) return setError(res.message);
      onClose();
      router.refresh();
    });
  };

  return createPortal(
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/60" />
      <div className="sx-drawer absolute inset-y-0 right-0 flex w-full max-w-4xl flex-col border-l border-line bg-surface shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold tracking-tight">{s.campaign.name}</h2>
            <p className="text-xs text-muted">{s.sponsorName} · ends {dayLabel(s.endsAt)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted hover:text-text">
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <section aria-label="Shortfall">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact label="Sold" value={fmtCount(s.sold)} sub={metric} />
              <Fact label="Projected" value={fmtCount(s.projected)} sub="forecast final" />
              <Fact label="Short" value={fmtCount(s.shortfall)} sub={`${pct(shortfallShare(s))} of what was sold`} />
              <Fact label="Value short" value={usd(s.shortfallValueCents)} sub="estimated" />
            </dl>
            <StampLine stamp={s.stamp} className="mt-2" />
          </section>

          {s.decision && (
            <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-text">
              <strong className="font-semibold">Approved{chosen ? `: ${chosen.inventoryName}` : ""}</strong> — by {s.decision.by}, {dayLabel(s.decision.at)}.
              <span className="mt-1 block text-muted">&ldquo;{s.decision.note}&rdquo;</span>
            </p>
          )}

          <section aria-label="Substitute options" className="space-y-2">
            <h3 className="text-sm font-semibold">Substitutes</h3>
            {s.options.length === 0 ? (
              <p className="text-xs text-muted">The engine found no substitute that is available and free of conflicts. BTG will need to find one by hand.</p>
            ) : (
              <ul className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]">
                {s.options.map((o) => (
                  <OptionCard
                    key={o.id}
                    s={s}
                    o={o}
                    best={best?.id === o.id}
                    chosen={chosen?.id === o.id}
                    picked={picked === o.id}
                    onPick={() => {
                      setPicked(o.id);
                      setError(null);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          {!s.decision && pickedOption && (
            <form
              className="space-y-3 rounded-xl border border-primary/40 bg-surface-2 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <p className="text-sm">
                Approve <strong>{pickedOption.inventoryName}</strong> ({pickedOption.propertyName}) — {costWords(pickedOption.costImpactCents).toLowerCase()}.
              </p>
              <NoteField id={`mg-${s.id}-note`} label="Why this substitute" hint={`Goes on the audit record and the campaign — at least ${MIN_REASON} characters.`} value={note} onChange={setNote} />
              <DialogError message={error} />
              {sample && <p className="text-[11px] text-warn">Sample preview — approving here sends nothing.</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={btn.quiet} onClick={() => setPicked(null)}>Cancel</button>
                <button type="submit" className={btn.primary} disabled={pending || !note.trim() || sample}>
                  {pending ? "Approving…" : "Approve substitute"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 px-3 py-2.5">
      <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
      <dd className="text-[11px] text-faint">{sub}</dd>
    </div>
  );
}

function OptionCard({ s, o, best, chosen, picked, onPick }: {
  s: Shortfall; o: MakeGoodOption; best: boolean; chosen: boolean; picked: boolean; onPick: () => void;
}) {
  const block = approvalBlock(s, o);
  const covers = coverage(s, o);
  return (
    <li className={`flex flex-col gap-3 rounded-xl border p-4 ${picked || chosen ? "border-primary/60 bg-primary/5" : "border-line bg-surface"}`}>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <strong className="text-[13px] font-semibold">{o.inventoryName}</strong>
          {chosen && <StatusChip tone="success">Approved</StatusChip>}
          {best && !s.decision && <StatusChip tone="success">Best match</StatusChip>}
        </div>
        <p className="text-[11px] text-muted">{o.propertyName} · {o.format}</p>
      </div>

      <div>
        <p className="flex items-baseline justify-between text-[11px] text-muted">
          <span>Equivalency</span>
          <span className="font-semibold tabular-nums text-text">{equivalencyLabel(o.equivalencyScore)}</span>
        </p>
        <div className="mt-1"><Meter value={o.equivalencyScore * 100} /></div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <dt className="text-muted">Cost impact</dt>
          <dd className="font-semibold tabular-nums">{signedUsd(o.costImpactCents)}</dd>
        </div>
        <div>
          <dt className="text-muted">Covers</dt>
          <dd className="font-semibold tabular-nums">{pct(Math.min(covers, 9.99))} of the gap</dd>
        </div>
      </dl>
      <p className="-mt-2 text-[11px] text-faint">{costWords(o.costImpactCents)} · est. {fmtCount(o.estimatedDelivery)} {METRIC_WORD[s.metric]}</p>

      <ul className="space-y-1 text-[11px]" aria-label="Checks">
        {CHECKS.map((c) => {
          const ok = o.checks[c.key];
          return (
            <li key={c.key} className={`flex items-start gap-1.5 ${ok ? "text-text" : "text-danger"}`}>
              <span aria-hidden="true" className={`mt-px font-bold ${ok ? "text-success" : "text-danger"}`}>{ok ? "✓" : "✕"}</span>
              <span>{ok ? c.pass : c.fail}</span>
            </li>
          );
        })}
      </ul>

      <p className="text-[11px] leading-relaxed text-muted">{o.reason}</p>

      {!s.decision && (
        <div className="mt-auto">
          <button type="button" onClick={onPick} disabled={Boolean(block)} aria-pressed={picked} className={`${btn.quiet} w-full`}>
            {picked ? "Selected" : "Approve this substitute…"}
          </button>
          {block && <p className="mt-1.5 text-[11px] text-danger">{block}</p>}
        </div>
      )}
    </li>
  );
}
