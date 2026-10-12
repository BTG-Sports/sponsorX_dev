"use client";

/* The "?" explainer (P1-ART-23): one plain sentence about a number, on
   hover, focus or tap. A real button (never inside a link — tiles that link
   use a covering <a> beside it). Tap/click always opens (never toggles
   closed — a second tap on a touch screen must not look like it did
   nothing); hover only opens it for a real mouse, never for a touch
   "hover" simulation. Escape, a tap/click elsewhere, a mouse pointer
   leaving, or blur all close it. */

import { useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export function StadiumHint({
  label,
  text,
  skin = "stadium",
}: {
  /** What the number is called ("People reached"). */
  label: string;
  text: string;
  /** P1-ART-25 — whose look the "?" and its tip wear: `sx-<skin>-q` /
   *  `sx-<skin>-tip` (stadium.css, vault.css). The behaviour is the same. */
  skin?: "stadium" | "vault";
}) {
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

  const onPointerEnter = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === "mouse") setOpen(true);
  };
  const onPointerLeave = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === "mouse") setOpen(false);
  };

  return (
    <span ref={ref} className="relative inline-flex align-middle" onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}>
      <button
        type="button"
        className={`sx-${skin}-q`}
        aria-label={`What is “${label}”?`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={id} className={`sx-pop sx-${skin}-tip`}>
          {text}
        </span>
      )}
    </span>
  );
}
