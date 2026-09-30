"use client";

/* --------------------------------------------------------------------------
   Flight stop (P1-ART-09) — one waypoint's 2D overlay.

   Fills the sticky stage and shows its children only while the drone is
   hovering at its stop: `stopWeight` is 1 on a small plateau around the
   stop's progress, eases to 0 a little further out. The weight drives
   opacity and a short rise, through a ref on every store change — no React
   render per scroll. Below half weight the overlay stops taking pointer
   events; near zero it is `inert` (set on the client only, so a no-JS
   reader — see the page's <noscript> styles — gets every section live), so
   keyboard focus never lands on an invisible section. The server renders
   the first stop visible and the rest hidden, which is also what progress 0
   gives on the client.

   The weight is also written to `--sx-w` on the section, for content that
   wants to stage its own entrance from it.

   `id` is the section anchor the nav links use (`how-it-works`); `stop` is
   the flight stop it belongs to (`basketball`).
   -------------------------------------------------------------------------- */
import { useEffect, useRef, type ReactNode } from "react";

import { STOPS, stopWeight } from "@/lib/city/flight";
import { useFlight } from "@/lib/city/flight-store";

export interface FlightStopProps {
  stop: string;
  id?: string;
  children: ReactNode;
  /** Applied to the content column (width, alignment). */
  className?: string;
  /** Edge-to-edge stage with no container or gutters (the hero mockup). */
  bleed?: boolean;
}

const RISE_PX = 28;

function stopProgress(stop: string): number {
  const s = STOPS.find((x) => x.id === stop);
  if (!s) throw new Error(`Unknown flight stop "${stop}"`);
  return s.progress;
}

export function FlightStop({ stop, id, children, className = "", bleed = false }: FlightStopProps) {
  const at = stopProgress(stop);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let lastW = -1;
    const apply = (progress: number) => {
      const w = stopWeight(progress, at);
      if (w === lastW) return;
      lastW = w;
      el.style.opacity = String(w);
      el.style.transform = `translate3d(0, ${((1 - w) * RISE_PX).toFixed(1)}px, 0)`;
      el.style.pointerEvents = w > 0.5 ? "auto" : "none";
      el.inert = w < 0.02;
      // Exposed so a stop's content can choreograph its own arrival
      // (the sponsor packages rise in one after another).
      el.style.setProperty("--sx-w", w.toFixed(3));
    };
    apply(useFlight.getState().progress);
    return useFlight.subscribe((s) => apply(s.progress));
  }, [at]);

  const initial = stopWeight(0, at);
  return (
    <section
      ref={ref}
      id={id}
      data-stop={stop}
      className="sx-flight-stop absolute inset-0 overflow-y-auto"
      style={{
        opacity: initial,
        pointerEvents: initial > 0.5 ? "auto" : "none",
        willChange: "opacity, transform",
      }}
    >
      {bleed ? (
        // Full-bleed: no container, no gutters — the stop's content owns the
        // whole stage below the 72px header and lays out its own bands.
        <div className={["flex min-h-full w-full flex-col pt-[72px]", className].join(" ")}>{children}</div>
      ) : (
        <div className={["mx-auto flex min-h-full w-full max-w-6xl items-center px-6 pb-10 pt-20", className].join(" ")}>
          <div className="w-full">{children}</div>
        </div>
      )}
    </section>
  );
}
