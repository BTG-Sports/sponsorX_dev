"use client";

/* The "?" explainer (P1-ART-23): one plain sentence about a number, on
   hover, focus or tap. A real button (never inside a link — tiles that link
   use a covering <a> beside it). Escape and a tap elsewhere close it. */

import { useEffect, useId, useRef, useState } from "react";

export function StadiumHint({ label, text }: { /** What the number is called ("People reached"). */ label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="sx-stadium-q"
        aria-label={`What is “${label}”?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={id} className="sx-pop sx-stadium-tip">
          {text}
        </span>
      )}
    </span>
  );
}
