"use client";

import { useEffect, useRef, useState } from "react";

import type { ShotEntry } from "@/lib/help/types";
import { HelpShot } from "./help-shot";
import { labelSegments } from "./help-text";

/* --------------------------------------------------------------------------
   POL-FE-99 — an article read as a guided tour.

   The rail on the left lists the steps; its line fills as you scroll, and
   the step in the middle of the screen is lit. As a step arrives its
   screenshot eases in toward the thing to click and the rest of the picture
   dims. Click a screenshot to see it full size: it grows out of the frame
   it was in (FLIP), and Esc or a click outside closes it.
   -------------------------------------------------------------------------- */

export type TourStep = { title: string; body: string; route: string; shot: ShotEntry | null };

function Body({ text }: { text: string }) {
  return (
    <>
      {labelSegments(text).map((s, i) => (s.ui ? <span key={i} className="hc-ui">{s.text}</span> : <span key={i}>{s.text}</span>))}
    </>
  );
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function HelpTour({ steps }: { steps: TourStep[] }) {
  const [active, setActive] = useState(0);
  const [box, setBox] = useState<number | null>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const from = useRef<DOMRect | null>(null);

  useEffect(() => {
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target, e.isIntersecting);
        const i = refs.current.findIndex((el) => el && seen.get(el));
        if (i >= 0) setActive(i);
      },
      { rootMargin: "-40% 0px -45% 0px" },
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);

  /* the lightbox: open, then grow the picture out of the frame it came from */
  useEffect(() => {
    const d = dialog.current;
    if (box === null || !d) return;
    if (!d.open) d.showModal();
    const img = d.querySelector(".hc-lightbox-frame");
    const a = from.current;
    if (img && a && !reduced()) {
      const b = img.getBoundingClientRect();
      img.animate(
        [
          { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width}, ${a.height / b.height})`, opacity: 0.6 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
  }, [box]);

  const close = () => {
    dialog.current?.close();
  };

  const go = (i: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    refs.current[i]?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" });
    history.replaceState(history.state, "", `#step-${i + 1}`);
  };

  const shown = box === null ? null : steps[box];
  const progress = steps.length > 1 ? active / (steps.length - 1) : 1;

  return (
    <div className="hc-tour">
      <nav className="hc-rail" aria-label="Steps">
        <span className="hc-rail-line" aria-hidden="true" style={{ "--progress": progress } as React.CSSProperties} />
        <ol>
          {steps.map((s, i) => (
            <li key={i} data-state={i < active ? "done" : i === active ? "now" : undefined}>
              <a href={`#step-${i + 1}`} onClick={go(i)} aria-current={i === active ? "step" : undefined}>
                <span className="hc-rail-dot">{i < active ? "✓" : i + 1}</span>
                <span className="hc-rail-t">{s.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <ol className="hc-steps">
        {steps.map((s, i) => (
          <li
            key={i}
            id={`step-${i + 1}`}
            ref={(el) => {
              refs.current[i] = el;
            }}
            className="hc-step"
            data-active={i === active || undefined}
            style={{ "--i": i } as React.CSSProperties}
          >
            <div className="hc-step-text">
              <span className="hc-step-n" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h2>
                  <span className="sr-only">Step {i + 1}: </span>
                  {s.title}
                </h2>
                <p>
                  <Body text={s.body} />
                </p>
              </div>
            </div>
            {s.shot ? (
              <button
                type="button"
                className="hc-shot-btn"
                aria-label={`See step ${i + 1} full size`}
                onClick={(e) => {
                  from.current = (e.currentTarget.querySelector(".hc-shot-view") ?? e.currentTarget).getBoundingClientRect();
                  setBox(i);
                }}
              >
                <HelpShot shot={s.shot} route={s.route} alt={`Step ${i + 1}: ${s.title}`} priority={i === 0} />
                <span className="hc-zoom-hint" aria-hidden="true">Click to enlarge</span>
              </button>
            ) : (
              <HelpShot shot={null} route={s.route} alt="" />
            )}
          </li>
        ))}
      </ol>

      <dialog
        ref={dialog}
        className="hc-lightbox"
        aria-label={shown ? `Step ${box! + 1}: ${shown.title}` : "Screenshot"}
        onClose={() => setBox(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {shown && (
          <>
            <div className="hc-lightbox-head">
              <p>
                <b>Step {box! + 1}.</b> {shown.title}
              </p>
              <button type="button" onClick={close} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="hc-lightbox-frame">
              <HelpShot shot={shown.shot} route={shown.route} alt={`Step ${box! + 1}: ${shown.title}`} priority />
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
