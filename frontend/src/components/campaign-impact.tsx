"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import {
  NO_MONEY_MOVES,
  holdNote,
  impactGroups,
  impactHeadline,
  impactMoneyLines,
  type ApiCampaignImpact,
} from "@/lib/campaign-change-live";
import { useDialogFocus } from "./use-dialog-focus";
import { useMounted } from "./use-mounted";

/* --------------------------------------------------------------------------
   P8-FE-12 — what cancelling or changing a campaign affects, on screen. The
   same view sits in the confirm modal (sponsor and BTG) and on each row of
   BTG's Campaign requests queue: the headline count, each group with its
   count and outcome in words (expanding to its items), the money, why BTG
   has to approve it, and why it is refused.
   -------------------------------------------------------------------------- */

export function ImpactView({ impact, compact = false }: { impact: ApiCampaignImpact; compact?: boolean }) {
  const groups = impactGroups(impact);
  const moneyLines = impactMoneyLines(impact);
  const hold = holdNote(impact);
  const refusals = impact.refusals.filter((r) => r.trim());
  return (
    <div className="space-y-3">
      <p className={`${compact ? "text-sm" : "text-base"} font-semibold tracking-tight`}>{impactHeadline(impact)}</p>

      {groups.length > 0 && (
        <ul className="divide-y divide-line-soft rounded-lg border border-line-soft" aria-label="Affected products">
          {groups.map((g) => (
            <ImpactGroupRow key={g.key} label={g.label} count={g.count} outcome={g.outcome} items={g.items} />
          ))}
        </ul>
      )}

      <dl className="space-y-1 text-[13px]">
        {moneyLines.length === 0 ? (
          <div className="text-muted">{NO_MONEY_MOVES}</div>
        ) : (
          moneyLines.map((m) => (
            <div key={m.label} className="flex items-baseline justify-between gap-3">
              <dt className="text-muted">{m.label}</dt>
              <dd className={`font-semibold tabular-nums ${m.tone === "refund" ? "text-accent" : "text-text"}`}>{m.amount}</dd>
            </div>
          ))
        )}
      </dl>

      {hold && (
        <p role="status" className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[12px] leading-relaxed text-text">
          {hold}
        </p>
      )}

      {refusals.length > 0 && (
        <div role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[12px] leading-relaxed text-danger">
          {refusals.map((r) => (
            <p key={r}>{r}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ImpactGroupRow({ label, count, outcome, items }: { label: string; count: number; outcome: string; items: { id: string; name: string; detail?: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const canOpen = items.length > 0;
  return (
    <li>
      <button
        type="button"
        onClick={() => canOpen && setOpen((o) => !o)}
        aria-expanded={canOpen ? open : undefined}
        disabled={!canOpen}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] disabled:cursor-default"
      >
        <span className="min-w-6 rounded-full bg-surface-2 px-2 py-0.5 text-center text-[11px] font-semibold tabular-nums">{count}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium [overflow-wrap:anywhere]">{label}</span>
          <span className="block text-[11px] text-muted [overflow-wrap:anywhere]">{outcome}</span>
        </span>
        {canOpen && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`size-3.5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        )}
      </button>
      {open && (
        <ul className="space-y-1 border-t border-line-soft bg-surface-2/40 px-3 py-2 text-[12px]" aria-label={`${label} — items`}>
          {items.map((it) => (
            <li key={it.id} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="font-medium [overflow-wrap:anywhere]">{it.name}</span>
              {it.detail && <span className="text-muted [overflow-wrap:anywhere]">{it.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/* ------------------------------------------------------------ the dialog */

/** The modal shell the campaign dialogs share: portaled to <body>, focus
 *  kept inside, Escape closes, a sheet on a phone and a centred card from
 *  sm up — wide enough for the affected-products list. */
export function CampaignDialog({ id, title, onClose, onSubmit, children }: {
  id: string;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/65" />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-start sm:pt-24">
        <form
          className="sx-pop relative flex w-full max-w-[34rem] flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight">{title}</h2>
          {children}
        </form>
      </div>
    </div>,
    document.body,
  );
}

export const dialogBtn = {
  primary: "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40",
  quiet: "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40",
  danger: "inline-flex min-h-11 items-center justify-center rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40",
} as const;

export const fieldCls = "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal text-text focus:border-primary/60 focus:outline-none";
