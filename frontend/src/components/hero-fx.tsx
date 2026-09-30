"use client";

/* --------------------------------------------------------------------------
   Hero effects (landing plaza stop) — three small client islands the
   otherwise server-rendered hero wraps its pieces in. None of them changes
   layout, so the stop stays one view on a phone; all of them stand down
   for `prefers-reduced-motion`, and the pointer ones only run with a fine,
   hovering pointer.

   - ScrambleText  decodes its text in from random glyphs once the loading
                   screen releases the page (`html[data-sx-loaded]`,
                   landing-loader.tsx). The real text holds the layout
                   (invisible) and is what assistive tech reads; the
                   scrambling copy is drawn over it, aria-hidden.
   - Magnetic      leans its child toward the pointer as it comes within
                   `reach` px, springing back when it leaves. The lean is
                   capped (`maxX`/`maxY`): two neighbours both drawn to a
                   pointer between them must never meet, so the cap stays
                   under half the gap between them (hero buttons: 24px gap,
                   8px cap).
   - TiltSpot      writes the pointer's position (--mx/--my) and a tilt
                   (--rx/--ry, unitless degrees) onto itself, plus --spot
                   and `data-hot` while hovered; globals.css turns those
                   into the impact card's tilt and outline spotlight.
   -------------------------------------------------------------------------- */

import { useEffect, useRef, type ReactNode } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/<>#%&*+=";

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function finePointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Run `fn` once the landing's loading screen has released the page. */
export function whenLoaded(fn: () => void): () => void {
  const html = document.documentElement;
  if (html.hasAttribute("data-sx-loaded")) {
    fn();
    return () => {};
  }
  const mo = new MutationObserver(() => {
    if (!html.hasAttribute("data-sx-loaded")) return;
    mo.disconnect();
    fn();
  });
  mo.observe(html, { attributes: true, attributeFilter: ["data-sx-loaded"] });
  return () => mo.disconnect();
}

export function ScrambleText({ text, delay = 0 }: { text: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    let raf = 0;
    let timer = 0;
    const run = () => {
      const dur = 520 + text.length * 34;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        const settled = Math.floor(p * text.length);
        let out = "";
        for (let i = 0; i < text.length; i++) {
          const c = text[i];
          out += i < settled || c === " " ? c : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        }
        el.textContent = out;
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const stop = whenLoaded(() => {
      timer = window.setTimeout(run, delay * 1000);
    });
    return () => {
      stop();
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      el.textContent = text;
    };
  }, [text, delay]);

  return (
    <span className="relative inline-block">
      <span className="invisible">{text}</span>
      <span ref={ref} aria-hidden="true" className="absolute inset-0 overflow-hidden whitespace-nowrap">
        {text}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function Magnetic({
  children,
  reach = 40,
  strength = 0.18,
  maxX = 8,
  maxY = 5,
  className = "",
}: {
  children: ReactNode;
  /** How far outside its box (px) the pointer starts to pull. */
  reach?: number;
  /** Share of the pointer's offset from centre the child follows. */
  strength?: number;
  /** Largest lean (px) — keep maxX under half the gap to a neighbour. */
  maxX?: number;
  maxY?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !finePointer() || reducedMotion()) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      // The untransformed box: measure without the current pull.
      const r = el.getBoundingClientRect();
      const t = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      const cx = r.left - t.m41 + r.width / 2;
      const cy = r.top - t.m42 + r.height / 2;
      const dx = px - cx;
      const dy = py - cy;
      const near = Math.abs(dx) < r.width / 2 + reach && Math.abs(dy) < r.height / 2 + reach;
      const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));
      el.style.transform = near
        ? `translate3d(${clamp(dx * strength, maxX).toFixed(1)}px, ${clamp(dy * strength, maxY).toFixed(1)}px, 0)`
        : "";
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      el.style.transform = "";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [reach, strength, maxX, maxY]);

  return (
    <span ref={ref} className={`flex transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] ${className}`}>
      {children}
    </span>
  );
}

export function TiltSpot({ children, max = 7, className = "" }: { children: ReactNode; max?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !finePointer()) return;
    const still = reducedMotion();
    let raf = 0;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const x = px - r.left;
      const y = py - r.top;
      el.style.setProperty("--mx", `${x.toFixed(0)}px`);
      el.style.setProperty("--my", `${y.toFixed(0)}px`);
      if (!still) {
        el.style.setProperty("--rx", ((0.5 - y / r.height) * max).toFixed(2));
        el.style.setProperty("--ry", ((x / r.width - 0.5) * max * 1.2).toFixed(2));
      }
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      el.dataset.hot = "";
      el.style.setProperty("--spot", "1");
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      delete el.dataset.hot;
      el.style.setProperty("--spot", "0");
      el.style.setProperty("--rx", "0");
      el.style.setProperty("--ry", "0");
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [max]);

  return (
    <div ref={ref} className={`sx-tilt relative ${className}`}>
      {children}
    </div>
  );
}
