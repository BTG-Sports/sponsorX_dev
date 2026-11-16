"use client";

import { useRef, useState } from "react";

/* POL-FE-82 — "Share profile": the phone's share sheet where there is one,
   otherwise the link copied, with a short confirmation either way. */
export function ShareProfile({ name, path, label = "Share profile" }: { name: string; path: string; label?: string }) {
  const [said, setSaid] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (msg: string) => {
    setSaid(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaid(null), 2200);
  };

  const share = async () => {
    /* Always the public page's address, also when shared from the portal. */
    const url = window.location.origin + path;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `${name} · SponsorX`, url });
        return;
      } catch {
        /* Dismissed, or not allowed here: fall through to copying. */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied");
    } catch {
      flash("Copy the address bar to share");
    }
  };

  return (
    <button type="button" onClick={share} className="pp-btn pp-btn-ghost" aria-live="polite">
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {said ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : (
          <>
            <path d="M12 3v12" />
            <path d="M7.5 7.5L12 3l4.5 4.5" />
            <path d="M5 13v5.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V13" />
          </>
        )}
      </svg>
      <span>{said ?? label}</span>
    </button>
  );
}
