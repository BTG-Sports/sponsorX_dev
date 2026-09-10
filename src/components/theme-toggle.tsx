"use client";

import { useSyncExternalStore } from "react";

/* --------------------------------------------------------------------------
   Sun/moon theme toggle (A2). Dark is the default; "light" is stored in
   localStorage("sx-theme") and applied as data-theme on <html>. The root
   layout's inline script applies the stored value pre-paint.

   Theme state lives on the DOM (html[data-theme]), not in React state, so we
   read it via useSyncExternalStore rather than mirroring it into useState
   inside an effect — that would call setState synchronously on mount
   (react-hooks/set-state-in-effect) purely to resolve a value React never
   owned in the first place. useSyncExternalStore also supplies the
   "dark" server snapshot for free, matching the no-attribute SSR markup.
   -------------------------------------------------------------------------- */

type Theme = "dark" | "light";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

function applyTheme(next: Theme) {
  if (next === "light") {
    document.documentElement.dataset.theme = "light";
  } else {
    delete document.documentElement.dataset.theme;
  }
  try {
    localStorage.setItem("sx-theme", next);
  } catch {
    /* storage unavailable — theme still applies for this page */
  }
  listeners.forEach((listener) => listener());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => applyTheme(theme === "dark" ? "light" : "dark");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="grid size-9 cursor-pointer place-items-center rounded-full border border-line/70 bg-surface-2/40 text-muted transition-all duration-300 hover:-translate-y-0.5 hover:border-line hover:text-text hover:shadow-lg"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden="true"
      >
        {theme === "dark" ? (
          /* sun — offer the light side */
          <path d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
        ) : (
          /* moon — offer the dark side */
          <path d="M20 12.5A8 8 0 1 1 11.5 4a6.5 6.5 0 0 0 8.5 8.5Z" />
        )}
      </svg>
    </button>
  );
}
