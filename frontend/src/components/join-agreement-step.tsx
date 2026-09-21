"use client";

import { AGREEMENT } from "@/lib/join-flow";

/* --------------------------------------------------------------------------
   Section 10 — click-wrap (P1-ART-07 comp 10). Scrollable v0.4 draft terms,
   a real checkbox whose tick draws in, and the recording note. The Submit
   button itself lives in the wizard's action bar and is gated on `accepted`.
   G-05 stopped being a gate 2026-09-15 — the wording is draft, labelled so.
   -------------------------------------------------------------------------- */

export function JoinAgreementStep({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="max-h-[46vh] space-y-5 overflow-y-auto rounded-xl border border-line bg-surface-2 p-5">
        {AGREEMENT.clauses.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-text">{c.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{c.body}</p>
          </div>
        ))}
      </div>

      <label className="flex min-h-11 cursor-pointer items-start gap-3.5 rounded-xl border border-line bg-surface-2 p-4">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptedChange(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary ${
            accepted ? "bg-primary" : "bg-text"
          }`}
        >
          {accepted && (
            <svg viewBox="0 0 12 12" className="size-3.5" fill="none" stroke="var(--sx-cta-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.5l2.5 2.5 4.5-5.5" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0s" } as React.CSSProperties} />
            </svg>
          )}
        </span>
        <span className="text-sm leading-relaxed text-text">{AGREEMENT.checkbox}</span>
      </label>

      <p className="text-xs leading-relaxed text-faint">{AGREEMENT.recordNote}</p>
    </div>
  );
}
