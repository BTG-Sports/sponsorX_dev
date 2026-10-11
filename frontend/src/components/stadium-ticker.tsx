"use client";

/* The LED ticker (P1-ART-23), split out of stadium-stage.tsx: WCAG 2.2.2
   requires a way to pause moving content that lasts more than five seconds,
   so the strip needs a bit of client state. Hovering it already pauses
   (stadium.css), but that is not a control a keyboard or touch user can
   reach, hence the button. Reduced motion already freezes the track in CSS
   (it wraps instead of scrolling), so the button has nothing to do there and
   hides itself. */

import { useState, type CSSProperties } from "react";

/** `facts` already in plain words; empty → nothing rendered. */
export function StadiumTicker({ facts }: { facts: string[] }) {
  const [paused, setPaused] = useState(false);
  if (!facts.length) return null;
  const seconds = Math.max(18, facts.join(" ").length * 0.22);
  return (
    <section aria-label="Live now" className="sx-stadium-ticker -mx-5 -mt-8 mb-6 sm:-mx-8 lg:-mx-10 lg:-mt-10" data-paused={paused ? "" : undefined}>
      <div className="sx-stadium-ticker-mask">
        <ul className="sr-only">
          {facts.map((f, i) => (
            <li key={`${i}-${f}`}>{f}</li>
          ))}
        </ul>
        <div aria-hidden="true" className="sx-stadium-ticker-track" style={{ "--sx-tick": `${seconds}s` } as CSSProperties}>
          {facts.map((f, i) => (
            <span key={`a${i}`}>{f}</span>
          ))}
          {facts.map((f, i) => (
            <span key={`b${i}`} data-dup="">
              {f}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="sx-stadium-ticker-toggle"
        aria-pressed={paused}
        aria-label={paused ? "Play the ticker" : "Pause the ticker"}
        onClick={() => setPaused((v) => !v)}
      >
        {paused ? "▶" : "❚❚"}
      </button>
    </section>
  );
}
