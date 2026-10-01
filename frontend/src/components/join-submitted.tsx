"use client";

/* --------------------------------------------------------------------------
   After submit (P1-ART-07 comp 11). The 900ms entrance: check draws,
   timeline cascades, guardian card rises.

   2S1-FE-06 — a real submission (it carries the intake token) shows the
   LIVE checklist instead (join-checklist.tsx): SponsorX now approves an
   application by itself once the email is confirmed and the ID is in (a
   minor's guardian does their own steps), so "a person reads every
   application" is no longer the story. The ?demo=submitted render, which
   has no token, keeps the static timeline and guardian card.
   -------------------------------------------------------------------------- */

import { JoinChecklist } from "./join-checklist";

const TIMELINE = [
  { key: "submitted", title: "Submitted", tone: "success" },
  { key: "review", title: "Under review", sub: "Reviewed by hand. We'll email you either way.", tone: "warn" },
  { key: "decision", title: "Decision", sub: "Accepted, or declined with a reason.", tone: "muted" },
] as const;

export function JoinSubmitted({
  minor,
  guardianName,
  submittedAt,
  refId,
  intakeToken,
  onReviewAnswers,
  onUpdateRestrictions,
}: {
  minor: boolean;
  guardianName: string;
  submittedAt: string;
  /** The real application id (P3-FE-01) — absent on demo renders. */
  refId?: string;
  /** 2S1-FE-06 — the token that reaches the live checklist; absent on demo renders. */
  intakeToken?: string;
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
        {intakeToken
          ? "Confirm your email and upload your ID — most applications are approved straight away after that."
          : "Submitting isn't approval. A person at BTG reads every application — usually within 3 business days."}
      </p>
      {refId && (
        <p
          className="sx-join-rise mt-2 text-xs text-faint"
          style={{ "--sx-d": "0.22s" } as React.CSSProperties}
        >
          Reference: <span className="font-medium tabular-nums text-muted">{refId}</span>{" "}
          — also in the confirmation email.
        </p>
      )}

      {intakeToken ? (
        <div className="sx-join-rise mt-8" style={{ "--sx-d": "0.3s" } as React.CSSProperties}>
          <JoinChecklist token={intakeToken} />
        </div>
      ) : (
      <>
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
          {/* Wired with the application-status screen (P3-FE-02) — until then
              these are honestly disabled, not silently inert. */}
          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              disabled
              title="Guardian reminders arrive with the application-status screen (P3-FE-02)"
              className="min-h-11 cursor-not-allowed rounded-lg border border-warn/60 px-4 py-2.5 text-sm font-semibold text-warn opacity-50"
            >
              Resend email
            </button>
            <button
              type="button"
              disabled
              title="Guardian changes arrive with the application-status screen (P3-FE-02)"
              className="min-h-11 cursor-not-allowed rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-text opacity-50"
            >
              Change guardian
            </button>
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Reminder and guardian-change controls go live with the application
            status page.
          </p>
        </div>
      )}
      </>
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
