"use client";

import { useState, useTransition } from "react";

import { sendComingOfAgeLinkAction } from "@/app/(app)/athlete/settings/coming-of-age/actions";

/* --------------------------------------------------------------------------
   2S1-FE-08 — the guardian's side of the coming-of-age reminder: "Send
   <athlete> the link" emails the athlete their coming-of-age page (2S1-BE-12).
   The athlete's own side is a plain link to that page (coming-of-age-reminder).
   -------------------------------------------------------------------------- */

export function SendComingOfAgeLink({ label }: { label: string }) {
  const [state, setState] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="space-y-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await sendComingOfAgeLinkAction();
            setState(r.ok ? { ok: true, message: "Sent — they can upload it from any device." } : { ok: false, message: r.message });
          })
        }
        className="min-h-12 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "Sending…" : label}
      </button>
      {state && (
        <span role={state.ok ? "status" : "alert"} className={`block max-w-60 text-[11px] ${state.ok ? "text-success" : "text-danger"}`}>
          {state.message}
        </span>
      )}
    </span>
  );
}
