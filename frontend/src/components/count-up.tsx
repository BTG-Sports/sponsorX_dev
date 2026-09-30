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

   Inside a landing flight stop (`.sx-flight-stop`, flight-stop.tsx) the
   viewport test is useless — every stop sits in the one sticky stage, all
   "in view" from the first frame, so the counters finished before anyone
   reached them (the hero's behind the loading screen). There it counts
   when the stop is actually showing (its opacity > 0.5) and the loading
   screen has released the page (`html[data-sx-loaded]`), and resets to
   zero once the stop is hidden again, so it counts up on every arrival.
   -------------------------------------------------------------------------- */

const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n.toLocaleString("en-US");

export function CountUp({ value, prefix = "" }: { value: number; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const frameRef = useRef(0);

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

    const run = () => {
      started.current = true;
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1400);
        write(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    };

    const stop = el.closest<HTMLElement>(".sx-flight-stop");
    if (stop) {
      const html = document.documentElement;
      const opacity = () => parseFloat(stop.style.opacity || "0");
      const check = () => {
        if (!started.current) {
          if (html.hasAttribute("data-sx-loaded") && opacity() > 0.5) run();
        } else if (opacity() < 0.02) {
          cancelAnimationFrame(frameRef.current);
          started.current = false;
          write(0);
        }
      };
      const mo = new MutationObserver(check);
      mo.observe(stop, { attributes: true, attributeFilter: ["style"] });
      mo.observe(html, { attributes: true, attributeFilter: ["data-sx-loaded"] });
      check();
      return () => {
        mo.disconnect();
        cancelAnimationFrame(frameRef.current);
      };
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        run();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
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
