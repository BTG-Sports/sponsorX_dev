"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

/* --------------------------------------------------------------------------
   Journey strip — the athlete dashboard's teaching element (spec 2026-09-15).

   Four plain-English steps (Get invited → Accept the deal → Deliver & verify
   → Get paid) with the athlete's current stage highlighted and a live count
   under each step. Dismissible: the ✕ writes localStorage and the strip stays
   gone on future visits — the mental model only needs teaching until it's
   learned.

   Same island conventions as reveal.tsx / count-up.tsx: server page stays the
   source of truth (steps and counts arrive as props), the island only owns
   the dismissed bit. Server paint always renders the strip; returning
   dismissers drop it at hydration — a brief flash for them beats hiding it
   from everyone with JS off.
   -------------------------------------------------------------------------- */

const STORAGE_KEY = "sx-athlete-journey-dismissed";

/* Dismissal is storage state, not React state — read it through
   useSyncExternalStore so the server snapshot renders the strip, returning
   dismissers drop it at hydration, and the ✕ notifies without a
   setState-in-effect cascade (react-hooks/set-state-in-effect). The module
   flag covers private-mode browsers where localStorage.setItem throws:
   dismissal still works for the session, it just isn't remembered. */
let sessionDismissed = false;
let listeners: Array<() => void> = [];
const notify = () => {
  for (const l of listeners) l();
};
const subscribe = (cb: () => void) => {
  listeners.push(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    window.removeEventListener("storage", cb);
  };
};
const readDismissed = () => {
  if (sessionDismissed) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

export type JourneyStep = {
  label: string;
  /** Live count line under the label, e.g. "2 waiting". */
  sub: string;
  href?: string;
};

export function JourneyStrip({
  steps,
  current,
}: {
  steps: JourneyStep[];
  /** 0-based index of the athlete's current stage. */
  current: number;
}) {
  const hidden = useSyncExternalStore(subscribe, readDismissed, () => false);

  if (hidden) return null;

  const dismiss = () => {
    sessionDismissed = true;
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode — session flag above still hides it */
    }
    notify();
  };

  return (
    <div className="sx-animate flex items-start gap-2 rounded-xl border border-dashed border-line bg-surface px-3 py-3 sm:items-center sm:px-4">
      <ol className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-1">
        {steps.map((s, i) => {
          const state = i < current ? "done" : i === current ? "now" : "next";
          const body = (
            <span className="flex items-center gap-2.5 sm:flex-col sm:gap-1 sm:text-center">
              <span
                className={[
                  "inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                  state === "done"
                    ? "border-accent/50 text-accent"
                    : state === "now"
                      ? "border-athlete/60 bg-athlete/15 text-athlete"
                      : "border-line text-faint",
                ].join(" ")}
                aria-hidden="true"
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              <span className="min-w-0">
                <span
                  className={[
                    "block text-xs leading-tight",
                    state === "now"
                      ? "font-semibold text-text"
                      : state === "done"
                        ? "text-muted"
                        : "text-faint",
                  ].join(" ")}
                >
                  {s.label}
                </span>
                <span className="block text-[10px] leading-tight text-faint">
                  {s.sub}
                </span>
              </span>
            </span>
          );
          return (
            <li key={s.label} className="flex min-w-0 flex-1 items-center gap-1">
              {s.href ? (
                <Link
                  href={s.href}
                  className="min-w-0 flex-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-surface-2/70"
                >
                  {body}
                </Link>
              ) : (
                <span className="min-w-0 flex-1 px-1.5 py-1">{body}</span>
              )}
              {i < steps.length - 1 && (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="hidden size-3 shrink-0 text-faint sm:block"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide how it works"
        title="Hide — you can keep working without it"
        className="shrink-0 rounded-md p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-3.5"
          aria-hidden="true"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
