"use client";

/* --------------------------------------------------------------------------
   After submit (P1-ART-07 comp 11). Submission is not approval: a person at
   BTG reads every application. The guardian-pending card (minors, §4) blocks
   accepting a campaign, not the review itself — the copy says so in bold.
   The 900ms entrance: check draws, timeline cascades, guardian card rises.
   -------------------------------------------------------------------------- */

const TIMELINE = [
  { key: "submitted", title: "Submitted", tone: "success" },
  { key: "review", title: "Under review", sub: "Reviewed by hand. We'll email you either way.", tone: "warn" },
  { key: "decision", title: "Decision", sub: "Accepted, or declined with a reason.", tone: "muted" },
] as const;

export function JoinSubmitted({
  minor,
  guardianName,
  submittedAt,
  onReviewAnswers,
  onUpdateRestrictions,
}: {
  minor: boolean;
  guardianName: string;
  submittedAt: string;
  onReviewAnswers: () => void;
  onUpdateRestrictions: () => void;
}) {
  const when = new Date(submittedAt);
  const stamp = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <div className="px-6 py-10">
      <div className="sx-join-rise grid size-16 place-items-center rounded-full border-2 border-success/50">
        <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="var(--sx-success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 12.5l4 4 8-9" pathLength={1} className="sx-join-draw" style={{ "--sx-d": "0.15s" } as React.CSSProperties} />
        </svg>
      </div>

      <h1 className="sx-join-rise mt-6 text-3xl font-semibold tracking-tight" style={{ "--sx-d": "0.1s" } as React.CSSProperties}>
        Application submitted
      </h1>
      <p className="sx-join-rise mt-3 text-sm leading-relaxed text-muted" style={{ "--sx-d": "0.18s" } as React.CSSProperties}>
        Submitting isn&apos;t approval. A person at BTG reads every application —
        usually within 3 business days.
      </p>

      <div className="mt-8 border-t border-line pt-8">
        <ol className="space-y-7">
          {TIMELINE.map((t, i) => (
            <li key={t.key} className="sx-join-rise relative flex gap-5 pl-1" style={{ "--sx-d": `${0.3 + i * 0.12}s` } as React.CSSProperties}>
              {i < TIMELINE.length - 1 && (
                <span aria-hidden className="absolute left-[11px] top-6 h-[calc(100%+8px)] w-px bg-line" />
              )}
              <span
                aria-hidden
                className={`relative z-10 mt-1 size-[21px] shrink-0 rounded-full ${
                  t.tone === "success"
                    ? "bg-success"
                    : t.tone === "warn"
                      ? "border-2 border-warn bg-bg"
                      : "border-2 border-line bg-bg"
                }`}
              />
              <div>
                <p className={`text-base font-semibold ${t.tone === "warn" ? "text-warn" : t.tone === "muted" ? "text-muted" : "text-text"}`}>
                  {t.title}
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {t.key === "submitted" ? stamp : "sub" in t ? t.sub : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {minor && (
        <div
          className="sx-join-rise mt-8 rounded-xl border border-warn/45 border-l-2 border-l-warn bg-surface-2 p-5"
          style={{ "--sx-d": "0.7s" } as React.CSSProperties}
        >
          <p className="flex items-center gap-2.5 text-base font-semibold text-text">
            <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="var(--sx-warn)" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 4.5V8l2.5 1.5" />
            </svg>
            Waiting on your guardian
          </p>
          <p className="mt-2 text-sm leading-relaxed text-warn">
            {guardianName || "Your guardian"} hasn&apos;t confirmed yet. This does{" "}
            <strong className="font-semibold">not</strong> hold up your review — it only stops
            you accepting a campaign once you&apos;re approved.
          </p>
          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-warn/60 px-4 py-2.5 text-sm font-semibold text-warn transition-colors hover:bg-warn/10"
            >
              Resend email
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-2"
            >
              Change guardian
            </button>
          </div>
        </div>
      )}

      <div className="mt-10">
        <p className="text-[11px] font-medium text-muted">While you wait</p>
        <div className="mt-2 space-y-3">
          {[
            { label: "Review your answers", onClick: onReviewAnswers },
            { label: "Update restrictions", onClick: onUpdateRestrictions },
          ].map((row, i) => (
            <button
              key={row.label}
              type="button"
              onClick={row.onClick}
              className="sx-join-rise flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-4 text-left text-sm font-medium text-text transition-colors hover:bg-surface"
              style={{ "--sx-d": `${0.85 + i * 0.08}s` } as React.CSSProperties}
            >
              {row.label}
              <svg viewBox="0 0 16 16" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3.5L10.5 8 6 12.5" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
