"use client";

import { useEffect, useRef } from "react";

/* --------------------------------------------------------------------------
   Count-up-on-scroll for the landing counters (A2). Starts when the element
   enters the viewport; ease-out over ~1.4s; reduced-motion renders the final
   value immediately. Zero deps.

   Adapted from the spec's useState version: the displayed number is DOM
   state React never owns between renders (a mid-animation frame value), so
   this drives it with a ref + direct textContent writes instead of
   useState — calling setState synchronously inside the effect body (the
   reduced-motion branch) would trip this repo's react-hooks/set-state-in-effect
   rule, the same one theme-toggle.tsx documents working around. The
   IntersectionObserver/rAF callbacks that mutate textContent run
   asynchronously after the effect returns, same as insight-carousel.tsx's
   scroll/autoplay listeners.
   -------------------------------------------------------------------------- */

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString("en-US");

export function CountUp({ value, prefix = "" }: { value: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const write = (n: number) => {
      el.textContent = `${prefix}${fmt(n)}`;
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      write(value);
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        const t0 = performance.now();
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / 1400);
          write(Math.round(value * (1 - Math.pow(1 - p, 3))));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, prefix]);

  return (
    <span
      ref={ref}
      className="tabular-nums"
      aria-label={`${prefix}${fmt(value)}`}
    >
      {prefix}
      {fmt(0)}
    </span>
  );
}
