"use client";

/* --------------------------------------------------------------------------
   Operations Board effects (P1-ART-14) — the client islands the otherwise
   server-rendered "Mission Control" stage (ops-stage.tsx) needs. None of
   them changes layout, and the entrance is plain CSS (`.sx-ops-in`), so
   none of them is needed to see the board.

   - OpsStage  the stage root. With a fine, hovering pointer it writes the
               pointer onto itself — `--px` / `--py` (px, in the stage's box)
               for the follow-light and `--tx` / `--ty` (-1..1) for the floor's
               parallax, plus `data-lit` while the pointer is over it — and
               `--mx` / `--my` onto the `[data-spot]` card under the pointer,
               for its outline spotlight. One write a frame. Reduced motion or
               touch: nothing follows the pointer.
   - OpsCount  a figure that counts up from zero as its piece rises in. The
               server renders the real number, so no-JS (and a slow
               hydration) shows it; the count runs on the same text node
               React rendered, so a later re-render still lands. Screen
               readers get the real value only.
   -------------------------------------------------------------------------- */

import { useEffect, useRef, type ReactNode } from "react";

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function finePointer() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function OpsStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || reducedMotion() || !finePointer()) return;

    let raf = 0;
    let x = 0;
    let y = 0;
    let card: HTMLElement | null = null;
    const paint = () => {
      raf = 0;
      const r = root.getBoundingClientRect();
      root.style.setProperty("--px", `${(x - r.left).toFixed(0)}px`);
      root.style.setProperty("--py", `${(y - r.top).toFixed(0)}px`);
      root.style.setProperty("--tx", (((x - r.left) / r.width) * 2 - 1).toFixed(3));
      root.style.setProperty("--ty", (((y - r.top) / r.height) * 2 - 1).toFixed(3));
      if (card) {
        const c = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${(x - c.left).toFixed(0)}px`);
        card.style.setProperty("--my", `${(y - c.top).toFixed(0)}px`);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      x = e.clientX;
      y = e.clientY;
      card = (e.target as Element | null)?.closest<HTMLElement>("[data-spot]") ?? null;
      root.dataset.lit = "";
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onLeave = () => {
      delete root.dataset.lit;
      root.style.setProperty("--tx", "0");
      root.style.setProperty("--ty", "0");
    };
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} data-sx-ops="" className={className}>
      {children}
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("en-US");

/** Counts up to `value`, starting `delay` seconds after mount — set it to
 *  the piece's own entrance delay so the count runs as it rises in. */
export function OpsCount({ value, delay = 0, className = "" }: { value: number; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current?.firstChild;
    if (!node || value === 0 || reducedMotion()) return;
    const final = fmt(value);
    node.nodeValue = "0";
    let raf = 0;
    const timer = window.setTimeout(() => {
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1300);
        node.nodeValue = fmt(Math.round(value * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay * 1000);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      node.nodeValue = final;
    };
  }, [value, delay]);

  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true" className="tabular-nums">
        {fmt(value)}
      </span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
}
