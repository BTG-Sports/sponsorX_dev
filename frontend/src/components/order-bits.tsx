import type { ReactNode } from "react";

import type { Deadline, Pill, Tone } from "@/lib/order-automation-live";
import type { TrackStep } from "@/lib/seller-orders-live";

/* --------------------------------------------------------------------------
   2S4-FE-05 — small pieces the seller's, the sponsor's and BTG's order
   screens share (SellerOrderActions / SponsorOrderUpdates / OrderExceptions
   .dc.html): the deadline chip, the status pill, and the tinted status box.
   Server-safe — no hooks.
   -------------------------------------------------------------------------- */

const CHIP: Record<Tone, string> = {
  neutral: "border-line bg-surface-2 text-muted",
  primary: "border-primary-soft bg-primary/15 text-primary-soft",
  accent: "border-accent bg-accent/12 text-accent",
  warn: "border-warn bg-warn/12 text-warn",
  danger: "border-danger bg-danger/12 text-danger",
};

/** "Answer by Oct 3, 4:00 pm UTC · in 2 days" — a timer the screen reader doesn't announce each minute. */
export function DeadlineChip({ d, after }: { d: Deadline; after?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span role="timer" aria-live="off" className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${CHIP[d.tone]}`}>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        {d.label}
      </span>
      {after && <span className="text-xs leading-relaxed text-muted">{after}</span>}
    </div>
  );
}

const PILL: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  primary: "bg-primary/15 text-primary-soft",
  accent: "bg-accent/12 text-accent",
  warn: "bg-warn/12 text-warn",
  danger: "bg-danger/12 text-danger",
};

/** A status pill: words and a mark, never colour alone. */
export function StatePill({ p }: { p: Pill }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PILL[p.tone]}`}>
      <span aria-hidden="true">{p.mark}</span>
      {p.label}
    </span>
  );
}

export const BOX: Record<Tone, { box: string; title: string }> = {
  neutral: { box: "border-line bg-surface", title: "text-text" },
  primary: { box: "border-primary/40 bg-primary/8", title: "text-primary-soft" },
  accent: { box: "border-accent/40 bg-accent/10", title: "text-accent" },
  warn: { box: "border-warn/40 bg-warn/8", title: "text-warn" },
  danger: { box: "border-danger/40 bg-danger/10", title: "text-danger" },
};

/** The tinted status box: a title, a line of text, and the other side's words quoted. */
export function StatusBox({ tone, title, text, quote, children }: { tone: Tone; title: string; text?: string; quote?: string; children?: ReactNode }) {
  const t = BOX[tone];
  return (
    <section role="status" aria-label="Status" className={`flex flex-col gap-2 rounded-xl border px-4 py-3.5 ${t.box}`}>
      <p className={`text-[15px] font-semibold ${t.title}`}>{title}</p>
      {text && <p className="text-[13px] leading-relaxed text-text/85">{text}</p>}
      {quote && <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-[13px] leading-relaxed">{quote}</p>}
      {children}
    </section>
  );
}

const STEP_TONE = {
  primary: { box: "border-primary bg-primary/12", dot: "bg-primary/15 text-primary", note: "text-primary" },
  warn: { box: "border-warn bg-warn/10", dot: "bg-warn/15 text-warn", note: "text-warn" },
  danger: { box: "border-danger bg-danger/10", dot: "bg-danger/15 text-danger", note: "text-danger" },
} as const;

/** The four-step track under a line (Orders.dc.html / SellerOrderActions.dc.html). */
export function DeliveryTrack({ steps, label }: { steps: TrackStep[]; label: string }) {
  return (
    <ol aria-label={label} className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((s, i) => {
        const t = STEP_TONE[s.tone];
        return (
          <li
            key={s.label}
            aria-current={s.state === "current" ? "step" : undefined}
            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs ${s.state === "current" ? t.box : s.state === "done" ? "border-accent/35" : "border-line"}`}
          >
            <span
              aria-hidden="true"
              className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${s.state === "done" ? "bg-accent/15 text-accent" : s.state === "current" ? t.dot : "bg-surface-2 text-faint"}`}
            >
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className="flex flex-col">
              <span className={s.state === "current" ? "font-bold" : s.state === "done" ? "font-medium" : "font-medium text-faint"}>{s.label}</span>
              <span className={`text-[10px] ${s.state === "current" ? t.note : "text-faint"}`}>
                {s.note}
                <span className="sr-only">{s.state === "done" ? " — done" : s.state === "current" ? " — current step" : ""}</span>
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

