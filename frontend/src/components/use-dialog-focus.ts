"use client";

import { useEffect, useRef, type RefObject } from "react";

/* --------------------------------------------------------------------------
   Keyboard behaviour for a modal dialog / drawer (F-05, QA pass 5).

   The desks' drawers each did part of this inline (applications-desk,
   approvals-desk, matching-studio: Escape + scroll lock + focus the close
   button). The reward creator and QR drawers did none of it — 41 of 60 Tabs
   left the `aria-modal`. This is the whole contract in one place:

   - on open, focus moves INTO the dialog (the first element marked
     `data-autofocus`, else the first focusable one);
   - Tab and Shift+Tab wrap inside it — focus never leaves an aria-modal;
   - Escape calls `onClose`;
   - the page behind stops scrolling;
   - on close, focus returns to whatever had it before (the trigger).

   Mount it in the dialog component itself, so open = mounted.
   -------------------------------------------------------------------------- */

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    /* tabIndex -1 is out of the Tab order on purpose — e.g. a backdrop
       button that closes on click; Escape covers the keyboard. */
    (el) => el.tabIndex >= 0 && !el.hasAttribute("inert") && el.getClientRects().length > 0,
  );
}

export function useDialogFocus<T extends HTMLElement>(onClose: () => void): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  /* The latest onClose without re-running the effect (which would steal
     focus back to the first field on every parent render). */
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = root.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(root)[0] ?? root;
    first.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const head = items[0]!;
      const tail = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === head || !root.contains(active))) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (active === tail || !root.contains(active))) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return ref;
}
