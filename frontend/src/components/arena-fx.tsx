"use client";

/* --------------------------------------------------------------------------
   Arena effects (P1-ART-22) — the one client island the athlete stage's
   figures need. The stage root itself reuses OpsStage (ops-fx.tsx): its
   pointer light (--px / --py) and the plates' spotlight (--mx / --my on the
   `[data-spot]` under the pointer) are generic, and one island for both
   stages keeps them in step.

   ArenaCount counts a figure up from zero as its plate slides in. The
   server renders the final text, so no-JS and a slow hydration show the
   real value; the count runs on the text node React rendered. Money is
   given in cents (the API's unit everywhere) and printed as dollars.
   -------------------------------------------------------------------------- */

import { useEffect, useRef } from "react";

export type CountFormat = "int" | "usd" | "usd0" | "pct";

/** cents → "$1,234.56"; "usd0" cents → "$1,234" (rounded, no decimals);
 *  integers → "1,234"; pct → "73%". */
export function formatCount(value: number, format: CountFormat): string {
  if (format === "usd") return `$${(value / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (format === "usd0") return `$${Math.round(value / 100).toLocaleString("en-US")}`;
  if (format === "pct") return `${Math.round(value)}%`;
  return Math.round(value).toLocaleString("en-US");
}

export function ArenaCount({
  value,
  format = "int",
  delay = 0,
  className = "",
}: {
  value: number;
  format?: CountFormat;
  /** Seconds after mount — set it to the plate's own entrance delay. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current?.firstChild;
    if (!node || value === 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const final = formatCount(value, format);
    node.nodeValue = formatCount(0, format);
    let raf = 0;
    const timer = window.setTimeout(() => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1200);
        node.nodeValue = formatCount(value * (1 - Math.pow(1 - p, 3)), format);
        if (p < 1) raf = requestAnimationFrame(tick);
        else node.nodeValue = final;
      };
      raf = requestAnimationFrame(tick);
    }, delay * 1000);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      node.nodeValue = final;
    };
  }, [value, format, delay]);

  const text = formatCount(value, format);
  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" className="tabular-nums">
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
