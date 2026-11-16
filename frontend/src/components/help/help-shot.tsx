import type { ShotEntry } from "@/lib/help/types";

/* --------------------------------------------------------------------------
   POL-FE-99 — one step's screenshot in a browser frame, with the thing to
   click ringed. The ring is drawn here from the box the capture script
   measured (percent of the image), never baked into the picture, so a
   re-capture moves it with the UI. The spotlight is the ring's own huge
   shadow, clipped by the frame. Without a capture yet, the frame says so
   instead of showing a broken image.
   -------------------------------------------------------------------------- */

export function HelpShot({ shot, route, alt, priority = false }: { shot: ShotEntry | null; route: string; alt: string; priority?: boolean }) {
  const spot = shot?.spot ?? null;
  /* the address it was taken at, without a record's id or a demo switch; a pattern's "[id]" reads "…" */
  const shown = (shot?.path ?? route).split("?")[0].replace(/\[[^\]]+\]/g, "…");
  const origin = spot ?`${(spot.x + spot.w / 2).toFixed(2)}% ${(spot.y + spot.h / 2).toFixed(2)}%` : "50% 30%";
  return (
    <figure className="hc-shot" data-empty={!shot || undefined}>
      <div className="hc-shot-bar" aria-hidden="true">
        <i />
        <i />
        <i />
        <span className="hc-shot-url">
          <svg viewBox="0 0 24 24">
            <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5V11Z" />
          </svg>
          sponsorx.com{shown}
        </span>
      </div>
      {shot ? (
        <div className="hc-shot-view" style={{ aspectRatio: `${shot.w} / ${shot.h}`, "--origin": origin } as React.CSSProperties}>
          <div className="hc-shot-zoom">
            {/* A plain <img>: next/image optimisation is a host-specific primitive (stay host-portable). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.src} width={shot.w} height={shot.h} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
            {spot && (
              <span
                className="hc-spot"
                aria-hidden="true"
                style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.w}%`, height: `${spot.h}%` }}
              >
                <i />
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="hc-shot-view hc-shot-none">
          <span>Screenshot on its way. The steps above are current.</span>
        </div>
      )}
    </figure>
  );
}
