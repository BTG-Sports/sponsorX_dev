"use client";

/* --------------------------------------------------------------------------
   /brief stage effects (POL-FE-114). The client pieces the wizard's page is
   drawn on; none of them knows anything about the brief itself.

   - BriefStage   the page root. Arms the entrance (`data-armed`), so the
                  first screen waits for the boot screen or the page
                  transition (`html[data-sx-loaded]`) instead of playing
                  underneath it; a timer releases it anyway (`data-go`) if
                  that signal never comes. On a fine pointer it also writes
                  the pointer's place (`--px` / `--py`, `--tx` / `--ty`) for
                  the light and the drifting numeral. Without JS nothing is
                  armed and the page simply shows.
   - SpotGroup    a wrapper whose `[data-spot]` children light their border
                  toward the pointer, neighbours included.
   - Words        a heading's words, each rising in turn.
   - Confetti     one burst in the brand colours when a brief is sent.

   Reduced motion: no pointer effects, no burst; brief.css stills the rest.
   -------------------------------------------------------------------------- */

import { Fragment, useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

export function reducedMotion() {
  return typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}
function finePointer() {
  return window.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? false;
}

/** How long the armed entrance waits for the boot screen before showing anyway. */
const RELEASE_MS = 4_000;

export function BriefStage({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const html = document.documentElement;
    root.dataset.armed = "";
    const release = window.setTimeout(() => {
      root.dataset.go = "";
    }, RELEASE_MS);
    if (reducedMotion() || !finePointer()) return () => window.clearTimeout(release);

    let raf = 0;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      root.style.setProperty("--px", `${px.toFixed(0)}px`);
      root.style.setProperty("--py", `${(py + window.scrollY).toFixed(0)}px`);
      root.style.setProperty("--tx", ((px / window.innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty("--ty", ((py / window.innerHeight) * 2 - 1).toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      px = e.clientX;
      py = e.clientY;
      root.dataset.lit = "";
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      delete root.dataset.lit;
      root.style.setProperty("--tx", "0");
      root.style.setProperty("--ty", "0");
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    html.addEventListener("pointerleave", onLeave);
    return () => {
      window.clearTimeout(release);
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      html.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} data-sx-stage="" className={className} {...rest}>
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- spotlight */

export function SpotGroup({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !finePointer()) return;
    let raf = 0;
    let px = 0;
    let py = 0;
    const paint = () => {
      raf = 0;
      for (const card of el.querySelectorAll<HTMLElement>("[data-spot]")) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${(px - r.left).toFixed(0)}px`);
        card.style.setProperty("--my", `${(py - r.top).toFixed(0)}px`);
      }
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      el.style.setProperty("--spot", "1");
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => el.style.setProperty("--spot", "0");
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={className} {...rest}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- words */

/** The words stay ordinary text with ordinary spaces between them, so a
    screen reader reads the heading as one sentence. */
export function Words({ text }: { text: string }) {
  const words = text.split(" ");
  return (
    <>
      {words.map((w, i) => (
        <Fragment key={`${i}-${w}`}>
          <span className="bx-word" style={{ "--i": i } as CSSProperties}>
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}

/* ---------------------------------------------------------------- confetti */

const BURST = ["#f97a1f", "#fb923c", "#2e9bf5", "#63b4f8", "#f4f5f7"];
const BURST_MS = 2_600;

export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reducedMotion()) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const ox = w / 2;
    const oy = h * 0.3;
    const reach = Math.min(w, 900) / 900;
    const parts = Array.from({ length: 160 }, (_, i) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = (5 + Math.random() * 15) * (0.6 + reach * 0.4);
      return {
        x: ox,
        y: oy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 6,
        w: 5 + Math.random() * 7,
        h: 3 + Math.random() * 5,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        c: BURST[i % BURST.length],
      };
    });

    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = (t - t0) / BURST_MS;
      ctx.clearRect(0, 0, w, h);
      if (k >= 1) return;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      for (const p of parts) {
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.34;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-50 size-full" />;
}
