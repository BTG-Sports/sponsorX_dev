"use client";

import { useEffect, useRef, useState } from "react";
import { QrPattern } from "./reward-creator";

/* --------------------------------------------------------------------------
   The sales code card (P1-FE-19, spec §5.1, /s/[code] resolver §8). Designed
   for one real scenario: a sixteen-year-old in a parking lot handing their
   phone across a counter. So the two actions are Copy and a full-screen
   presentation mode — huge code, huge QR, nothing else on the screen.

   Copy and the overlay are client-side only; nothing here touches the
   backend. The QR is the decorative stand-in the reward creator uses — the
   real one is generated when Stage 9 wires /s/[code] (P9-FE-01).
   -------------------------------------------------------------------------- */

export function StudentCodeCard({
  code,
  link,
}: {
  code: string;
  link: string;
}) {
  const [copied, setCopied] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const timer = useRef(0);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard can be denied (permissions, non-secure context); the link
         is printed right on the card, so failing quietly loses nothing. */
    }
  };

  /* Presentation mode is modal in fact, so make it modal in behavior: focus
     moves onto the dialog's single control (the full-surface close button),
     Tab is pinned, the page behind cannot scroll, and focus returns to the
     trigger on close. */
  const overlayRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!presenting) return;
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    overlayRef.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresenting(false);
      if (e.key === "Tab") e.preventDefault(); // single-control dialog
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      before?.focus({ preventScroll: true });
    };
  }, [presenting]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-next/30 bg-surface p-5">
        {/* violet bloom, top-left — the portal's accent atmosphere */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-next opacity-[0.14] blur-[70px]"
        />
        <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
          <button
            type="button"
            onClick={() => setPresenting(true)}
            title="Show full screen"
            className="shrink-0 rounded-lg outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-next"
          >
            <QrPattern seed={code} className="size-28" />
          </button>
          <div className="min-w-0 text-center sm:text-left">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">
              Your sales code — it never changes
            </p>
            <p className="mt-1 bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              {code}
            </p>
            <p className="mt-1 truncate text-xs text-muted">{link}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-next px-3.5 py-2 text-xs font-medium text-cta-ink outline-none transition-colors hover:bg-next-soft focus-visible:ring-2 focus-visible:ring-next focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                {copied ? "Copied ✓" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => setPresenting(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-next"
              >
                Show full screen
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------- presentation mode overlay */}
      {presenting && (
        /* div[role=dialog] wrapping the close button — role="dialog" is not a
           permitted override on <button> (ARIA in HTML), and the override
           suppressed the control semantic for screen readers. */
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your sales code, full screen"
          className="sx-backdrop fixed inset-0 z-50 bg-bg"
        >
          <button
            ref={overlayRef}
            type="button"
            onClick={() => setPresenting(false)}
            aria-label="Close full-screen code"
            className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-6 px-6"
          >
            <QrPattern seed={code} className="size-56 sm:size-64" />
            <span className="bg-[linear-gradient(90deg,var(--sx-next-soft),var(--sx-next))] bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
              {code}
            </span>
            <span className="text-sm text-muted">{link}</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-faint">
              tap anywhere to close
            </span>
          </button>
        </div>
      )}
    </>
  );
}
