"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/* --------------------------------------------------------------------------
   Chart-reveal gate (chart motion pass, 2026-09-12). Wraps a chart and flips
   data-reveal "out" → "in" the first time it scrolls into view; the sx-viz-*
   CSS in globals.css keys the whole entrance choreography off that attribute.

   Same conventions as count-up.tsx: the attribute is DOM state React never
   owns between renders, so the observer writes el.dataset directly instead of
   setState. Degrades to the static final chart three ways — reduced motion
   (CSS kills the animations), no JS (the scripting:enabled pause gate never
   applies, so animations just run at load and settle), and no
   IntersectionObserver support (revealed immediately).
   -------------------------------------------------------------------------- */

export function Reveal({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      el.dataset.reveal = "in";
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.dataset.reveal = "in";
        io.disconnect();
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-reveal="out" className={className}>
      {children}
    </div>
  );
}
