"use client";

import { useState, useTransition } from "react";

import { resubmitApplicationAction, type ApplicationEdit } from "@/app/(public)/join/edit/actions";

/* POL-FE-70 — the applicant changes what BTG asked about and sends it back. */
const field = "w-full rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-sm text-text focus:border-primary focus:outline-none";

export function ApplicationEditForm({ token, initial }: { token: string; initial: ApplicationEdit }) {
  const [f, setF] = useState(initial);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  if (note?.ok) return <p role="status" className="rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm">{note.text}</p>;
  return (
    <form
      aria-label="Update your application"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await resubmitApplicationAction(token, f);
          setNote({ ok: r.ok, text: r.message });
        });
      }}
    >
      <label className="block space-y-1 text-xs font-medium text-muted">
        <span>Name on your profile</span>
        <input className={field} value={f.displayName} maxLength={100} onChange={(e) => setF((x) => ({ ...x, displayName: e.target.value }))} />
      </label>
      <label className="block space-y-1 text-xs font-medium text-muted">
        <span>Sport</span>
        <input className={field} value={f.sport} maxLength={60} onChange={(e) => setF((x) => ({ ...x, sport: e.target.value }))} />
      </label>
      <label className="block space-y-1 text-xs font-medium text-muted">
        <span>State (two letters)</span>
        <input className={field} value={f.stateCode} maxLength={2} onChange={(e) => setF((x) => ({ ...x, stateCode: e.target.value }))} />
      </label>
      {note && !note.ok && <p role="alert" className="text-xs text-danger">{note.text}</p>}
      <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-cta-ink hover:bg-primary-soft disabled:opacity-40">
        {pending ? "Sending…" : "Send it back to BTG"}
      </button>
    </form>
  );
}
