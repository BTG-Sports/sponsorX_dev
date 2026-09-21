"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { CloseIcon } from "@/components/filter-kit";
import { cx, TierMark } from "@/components/matching-bits";
import type { ConflictDetail, MatchAthlete } from "@/lib/matching";

/* --------------------------------------------------------------------------
   Conflict detail — the drawer behind every "Why" (P4-ART-01 screen 3).

   §26's whole point: an athlete who simply vanishes from a list is the
   failure mode this screen exists to prevent. The drawer shows the declared
   deal as facts, why it blocks this specific brief, its provenance, and the
   three things a manager can do about it. Same slide-over discipline as
   roster-ops' OrderDrawer: portaled by the caller, Escape/backdrop close,
   pinned header, scrolling middle.
   -------------------------------------------------------------------------- */

const FACT_TONE = {
  danger: "text-danger",
  warn: "text-warn",
  neutral: "text-text",
} as const;

export function ConflictDrawer({
  athlete,
  detail,
  closing,
  onRequestClose,
  onClosed,
  closeBtnRef,
}: {
  athlete: MatchAthlete;
  detail: ConflictDetail;
  closing: boolean;
  onRequestClose: () => void;
  onClosed: () => void;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
}) {
  /* Demo actions — noted for this visit only, nothing saved. */
  const [noted, setNoted] = useState<string | null>(null);

  /* Unmount rides the slide-out's animationend; the fallback timer covers a
     lost event (stale-CSS HMR) — roster-ops precedent. */
  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(onClosed, 300);
    return () => clearTimeout(t);
  }, [closing, onClosed]);

  return (
    <div
      className={cx("fixed inset-0 z-50", closing && "pointer-events-none")}
      role="dialog"
      aria-modal="true"
      aria-label={`${athlete.name} — conflict detail`}
    >
      <button
        type="button"
        aria-label="Close conflict detail"
        onClick={onRequestClose}
        className={cx(
          closing ? "sx-backdrop-out" : "sx-backdrop",
          "absolute inset-0 cursor-default bg-black/55",
        )}
      />

      <div
        className={cx(
          closing ? "sx-drawer-out" : "sx-drawer",
          "absolute inset-y-0 right-0 flex w-full max-w-lg flex-col border-l border-line bg-surface shadow-2xl",
        )}
        onAnimationEnd={(ev) => {
          if (ev.animationName === "sx-drawer-out") onClosed();
        }}
      >
        {/* ------------------------------------------------------- header */}
        <div className="sx-animate sx-delay-1 flex shrink-0 items-start gap-3 border-b border-line-soft p-5">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-danger/30 bg-danger/10 text-danger"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-5"
            >
              <path d="M12 4.5 2.8 20h18.4L12 4.5Z" />
              <path d="M12 10.2v4" />
              <path d="M12 17h.01" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug tracking-tight">
              {athlete.name} is blocked by a declared conflict
            </p>
            <p className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-muted">
              <TierMark tier={athlete.tier} className="h-3.5" />
              <span className="truncate">
                {athlete.sport} · {athlete.market} · {athlete.tier} tier · score{" "}
                {athlete.score}
              </span>
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onRequestClose}
            aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* --------------------------------------------- the declaration */}
          <section className="sx-animate sx-delay-2 border-b border-line-soft p-5">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-faint">
              The declaration
            </h3>
            <dl className="mt-3 grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {detail.facts.map((f, i) => (
                <div
                  key={f.k}
                  className="sx-join-rise"
                  style={{ ["--sx-d" as string]: `${80 + i * 45}ms` }}
                >
                  <dt className="text-[10px] uppercase tracking-wide text-faint">
                    {f.k}
                  </dt>
                  <dd className={cx("mt-0.5 text-xs font-medium", FACT_TONE[f.tone])}>
                    {f.v}
                  </dd>
                  <dd className="text-[10px] leading-snug text-muted">{f.sub}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ------------------------------------------- why this blocks */}
          <section className="sx-animate sx-delay-3 border-b border-line-soft p-5">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-faint">
              Why this blocks the invitation
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-muted">{detail.why}</p>
            <p className="mt-3 text-[10px] leading-relaxed text-faint">
              {detail.provenance}
            </p>
          </section>

          {/* ----------------------------------------------- what you can do */}
          <section className="sx-animate sx-delay-4 p-5">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-faint">
              What you can do
            </h3>
            <ul className="mt-3 space-y-3">
              {detail.actions.map((a) => {
                const isNoted = noted === a.title;
                return (
                  <li
                    key={a.title}
                    className="rounded-xl border border-line bg-surface-2/40 p-3.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs font-semibold tracking-tight">{a.title}</p>
                      <button
                        type="button"
                        onClick={() => setNoted(isNoted ? null : a.title)}
                        aria-pressed={isNoted}
                        className={cx(
                          "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                          isNoted
                            ? "border-admin/40 bg-admin/10 text-text"
                            : "border-line text-muted hover:bg-surface-2 hover:text-text",
                        )}
                      >
                        {isNoted ? "✓ Noted" : a.cta}
                      </button>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                      {a.body}
                    </p>
                  </li>
                );
              })}
            </ul>
            {noted && (
              <p className="sx-animate mt-3 text-[10px] text-faint" aria-live="polite">
                Noted for this visit only — demo actions are never saved.
              </p>
            )}
          </section>
        </div>

        {/* --------------------------------------------------------- footer */}
        <div className="shrink-0 border-t border-line-soft bg-surface-2/40 p-4">
          <p className="flex flex-wrap items-center justify-between gap-2 text-[10px] leading-relaxed text-faint">
            <span className="flex items-center gap-1.5">
              <Badge tone="danger">Blocked</Badge>
              Blocked athletes are never removed from the list — you can always
              see who was excluded and why.
            </span>
            <button
              type="button"
              onClick={onRequestClose}
              className="font-medium text-muted transition-colors hover:text-text"
            >
              Back to matching
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
