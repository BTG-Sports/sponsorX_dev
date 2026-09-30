"use client";

/* --------------------------------------------------------------------------
   /next/about effects — the one client island the otherwise server-rendered
   magazine stage (next-about-stage.tsx) needs. It changes no layout.

   - CoverGlow  wraps the cover plate and writes the pointer's position into
                it as `--gx` / `--gy` (percent) plus `--glow` 0|1, one write a
                frame, fine pointer only; globals.css (`.sx-mag-cover-glow`)
                draws the radial glow. On touch the glow is fixed at the
                masthead and `data-pulse` plays it once with the entrance —
                set only once `html[data-sx-loaded]` is (hero-fx's whenLoaded).
                Reduced motion: nothing is written, nothing pulses. The tilt
                itself is the landing's TiltSpot, wrapped outside this.
   -------------------------------------------------------------------------- */

import { useEffect, useRef, type ReactNode } from "react";

import { whenLoaded } from "./hero-fx";

export function CoverGlow({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return whenLoaded(() => {
        el.dataset.pulse = "";
      });
    }
    let raf = 0;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--gx", `${(((px - r.left) / r.width) * 100).toFixed(1)}%`);
      el.style.setProperty("--gy", `${(((py - r.top) / r.height) * 100).toFixed(1)}%`);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      px = e.clientX;
      py = e.clientY;
      el.style.setProperty("--glow", "1");
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => el.style.setProperty("--glow", "0");
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {children}
      <span aria-hidden="true" className="sx-mag-cover-glow" />
    </div>
  );
}
