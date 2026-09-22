"use client";
import { useEffect, useRef } from "react";
import { CHAPTERS } from "@/lib/landing-chapters";

/* --------------------------------------------------------------------------
   Transition beat (P1-ART-08). Turns the black passage between stadiums into a
   kinetic "traveling transition": warp-speed streaks rushing down, a glowing
   ball-comet streaking through, and the next chapter's title card rushing in —
   all drawn on a 2D overlay and driven imperatively by the 3D scene's own eased
   progress (via `api.update`), so the beat is perfectly synced to the drop.
   No React re-renders per frame; everything is set on refs.
   -------------------------------------------------------------------------- */

export interface TransitionState {
  dark: number; // black backdrop opacity 0..1
  phase: number; // 0 (entering the gap) .. 1 (landed in next) — beat timeline
  from: number; // leaving chapter index
  to: number; // arriving chapter index
  active: boolean; // within the beat window
}

export interface TransitionApi {
  update: (s: TransitionState) => void;
}

/** Title card copy for each arriving chapter (indices 1..5). */
const CARDS: Record<number, { n: string; name: string; tag: string }> = {
  1: { n: "01", name: "SOCCER", tag: "One network. Every sport." },
  2: { n: "02", name: "BASKETBALL", tag: "Matching, done for you." },
  3: { n: "03", name: "BASEBALL", tag: "Packages, priced up front." },
  4: { n: "04", name: "FOOTBALL", tag: "Results. Fans rewarded." },
  5: { n: "05", name: "START", tag: "Start with one campaign." },
};

const accentRGB = (i: number): [number, number, number] =>
  CHAPTERS[i]?.accent === "orange" ? [249, 122, 31] : [46, 155, 245];
const mix = (a: [number, number, number], b: [number, number, number], t: number): string =>
  `${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)}`;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function LandingTransition({ apiRef }: { apiRef: React.MutableRefObject<TransitionApi | null> }) {
  const blackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);
  const streaksRef = useRef<{ x: number; y: number; len: number; speed: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    if (streaksRef.current.length === 0) {
      for (let i = 0; i < 46; i++) {
        streaksRef.current.push({
          x: Math.random(),
          y: Math.random(),
          len: 0.08 + Math.random() * 0.18,
          speed: 0.6 + Math.random() * 1.0,
        });
      }
    }

    const draw = (s: TransitionState) => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      if (blackRef.current) blackRef.current.style.opacity = String(s.dark);

      // title card: rush in → hold → rush out across the beat
      if (cardRef.current) {
        const t = s.phase;
        const o = t < 0.24 ? 0 : t < 0.42 ? (t - 0.24) / 0.18 : t < 0.6 ? 1 : t < 0.82 ? 1 - (t - 0.6) / 0.22 : 0;
        cardRef.current.style.opacity = String(clamp01(o));
        const ty = (1 - clamp01(o)) * 20 * (t < 0.5 ? 1 : -1);
        cardRef.current.style.transform = `translate(-50%, calc(-50% + ${ty}px))`;
        if (o > 0) {
          const card = CARDS[s.to] ?? CARDS[5];
          if (numRef.current) {
            numRef.current.textContent = card.n;
            numRef.current.style.color = `rgb(${accentRGB(s.to).join(",")})`;
          }
          if (nameRef.current) nameRef.current.textContent = card.name;
          if (tagRef.current) tagRef.current.textContent = card.tag;
        }
      }

      ctx.clearRect(0, 0, w, h);
      if (!s.active) return;

      const rgb = mix(accentRGB(s.from), accentRGB(s.to), s.phase);
      const intensity = Math.sin(clamp01(s.phase) * Math.PI); // 0 at edges, 1 mid-gap
      ctx.globalCompositeOperation = "lighter";

      // warp-speed streaks rushing downward
      ctx.lineWidth = 1.6;
      for (const st of streaksRef.current) {
        const x = st.x * w;
        const len = st.len * h * (0.6 + intensity * 0.9);
        const y = ((st.y + s.phase * st.speed * 2.2) % 1.4) * h - len;
        const grad = ctx.createLinearGradient(x, y, x, y + len);
        grad.addColorStop(0, `rgba(${rgb},0)`);
        grad.addColorStop(0.5, `rgba(${rgb},${0.55 * intensity})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + len);
        ctx.stroke();
      }

      // ball-comet streaking down the center with a trail
      const cx = w / 2;
      const cy = (-0.25 + s.phase * 1.5) * h;
      const trail = ctx.createLinearGradient(cx, cy - h * 0.28, cx, cy);
      trail.addColorStop(0, `rgba(${rgb},0)`);
      trail.addColorStop(1, `rgba(${rgb},${0.55 * intensity})`);
      ctx.strokeStyle = trail;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(cx, cy - h * 0.28);
      ctx.lineTo(cx, cy);
      ctx.stroke();
      const head = ctx.createRadialGradient(cx, cy, 0, cx, cy, 46);
      head.addColorStop(0, `rgba(255,255,255,${0.95 * intensity})`);
      head.addColorStop(0.3, `rgba(${rgb},${0.85 * intensity})`);
      head.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = head;
      ctx.beginPath();
      ctx.arc(cx, cy, 46, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
    };

    apiRef.current = { update: draw };
    return () => {
      window.removeEventListener("resize", resize);
      apiRef.current = null;
    };
  }, [apiRef]);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[5]">
      <div ref={blackRef} className="absolute inset-0 bg-black opacity-0" />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div ref={cardRef} className="absolute left-1/2 top-1/2 text-center opacity-0">
        <div ref={numRef} className="text-sm font-bold tracking-[0.4em]" />
        <div ref={nameRef} className="mt-2 text-4xl font-extrabold tracking-[0.22em] text-white sm:text-6xl" />
        <div ref={tagRef} className="mt-3 text-sm tracking-wide text-white/70" />
      </div>
    </div>
  );
}
