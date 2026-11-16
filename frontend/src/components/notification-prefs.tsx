"use client";

import { useState, useTransition } from "react";

import { ALWAYS_SENT_LINE, emailRows, type ApiPreference } from "@/lib/notification-prefs-live";

/* --------------------------------------------------------------------------
   POL-FE-75 — the Notifications section in every portal's Settings: turn
   each kind of email on or off (PUT /me/notification-preferences). A switch
   flips at once and goes back if the API refuses, with its words.
   -------------------------------------------------------------------------- */

type Save = (event: string, muted: boolean) => Promise<{ ok: true; preferences: ApiPreference[] } | { ok: false; message: string }>;

export function NotificationPrefs({ initial, save, className }: { initial: ApiPreference[]; save: Save; className?: string }) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rows = emailRows(prefs);

  const flip = (event: string, muted: boolean) => {
    setError(null);
    const before = prefs;
    setPrefs((p) => p.map((x) => (x.event === event && x.channel === "EMAIL" ? { ...x, muted } : x)));
    start(async () => {
      const r = await save(event, muted);
      if (!r.ok) {
        setPrefs(before);
        setError(r.message);
        return;
      }
      setPrefs(r.preferences);
    });
  };

  return (
    <section aria-label="Notifications" className={className}>
      <h2 className="text-sm font-semibold">Notifications</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">Choose which emails SponsorX sends you.</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted">There are no emails to choose from for your account.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line-soft">
          {rows.map((r) => (
            <li key={r.event} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block text-sm text-text">{r.label}</span>
                {r.hint && <span className="block text-[11px] text-muted">{r.hint}</span>}
              </span>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-[11px] text-muted">
                <input
                  type="checkbox"
                  checked={!r.muted}
                  disabled={pending}
                  onChange={(e) => flip(r.event, !e.target.checked)}
                  aria-label={`Email me: ${r.label}`}
                />
                {r.muted ? "Off" : "On"}
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="mt-2 text-[11px] text-danger">{error}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">{ALWAYS_SENT_LINE}</p>
    </section>
  );
}
