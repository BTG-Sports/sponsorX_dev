"use client";

import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

/* --------------------------------------------------------------------------
   Focus containment for the slide-over drawers — aria-modal that actually
   modals. Declaring role="dialog" aria-modal="true" tells assistive tech the
   page behind is inert, but nothing enforced it: keyboard focus stayed in the
   list behind the backdrop (2026-09-24 QA sweep). This hook does the three
   duties: focus moves into the panel on open, Tab wraps inside it, and focus
   returns to the opener on close. Escape stays the caller's concern — both
   drawers already handle it (the exit animation must still run).
   -------------------------------------------------------------------------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useDrawerFocus<T extends HTMLElement>(
  open: boolean,
): {
  /** Put this on the panel, with tabIndex={-1} so it can take initial focus. */
  panelRef: RefObject<T | null>;
  /** Put this on the dialog wrapper. */
  onKeyDown: (e: ReactKeyboardEvent) => void;
} {
  const panelRef = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    panelRef.current?.focus({ preventScroll: true });
    return () => before?.focus({ preventScroll: true });
  }, [open]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    );
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return { panelRef, onKeyDown };
}
