"use client";

import { useSyncExternalStore, type CSSProperties } from "react";

import { checkLeft, leftWords } from "@/lib/sale-journey";

/* --------------------------------------------------------------------------
   POL-FE-96 — the sponsor's 24 hours to check a delivery, as a ring that
   drains, with the time left in the middle. The server's clock draws the
   first frame (so the markup matches), then it ticks every 20 seconds on
   the viewer's. At zero it says what happens: silence counts as confirmed.
   -------------------------------------------------------------------------- */

const STEP = 20_000;
function subscribe(on: () => void) {
  const id = window.setInterval(on, STEP);
  return () => window.clearInterval(id);
}
/** Now, to the last 20 seconds: the same value between ticks, so React doesn't loop. */
const tick = () => Math.floor(Date.now() / STEP) * STEP;

export function CheckClock({ markedAt, dueAt, serverNow, sponsor, due }: {
  markedAt: string;
  dueAt: string;
  serverNow: number;
  sponsor: string;
  /** "Nov 17, 9:40 pm UTC" — the deadline in words, from the server. */
  due: string;
}) {
  const now = useSyncExternalStore(subscribe, tick, () => serverNow);
  const p = checkLeft({ markedAt, confirmDueAt: dueAt }, now);
  const over = p <= 0;
  return (
    <div className="sx-sl-clock" data-over={over ? "" : undefined}>
      <span className="sx-sl-ring" style={{ "--p": p } as CSSProperties} role="timer" aria-live="off" aria-label={over ? "Time's up" : `${leftWords(dueAt, now)} left`}>
        <span className="sx-sl-ring-in">
          <strong className="sx-arena-num">{over ? "0 m" : leftWords(dueAt, now)}</strong>
          <span>{over ? "time's up" : "left to check"}</span>
        </span>
      </span>
      <div className="min-w-0 space-y-1.5">
        <p className="text-[15px] font-semibold leading-snug text-text">
          {over ? `${sponsor} didn't answer in time` : `${sponsor} is checking what you delivered`}
        </p>
        <p className="text-[13px] leading-relaxed text-muted">
          {over
            ? "So it counts as confirmed. This page updates within a few minutes."
            : `They have until ${due} to confirm it or report a problem. If they don't answer, it counts as confirmed — automatically.`}
        </p>
        <p className="text-[12px] font-semibold text-athlete">Nothing for you to do right now.</p>
      </div>
    </div>
  );
}
