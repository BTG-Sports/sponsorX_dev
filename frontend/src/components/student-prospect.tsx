"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "./ui";
import { submitProspectAction } from "@/app/(app)/next/actions";
import { STUDENT_CATEGORIES } from "@/lib/students-live";

/* P9-FE-01 — log a prospect for SponsorX's acceptance check. A student
   never decides acceptance; they hand it to SponsorX and hear back. */
export function ProspectForm({ disabledReason }: { disabledReason?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(STUDENT_CATEGORIES[0]![0]);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);

  if (disabledReason) {
    return (
      <Button disabled title={disabledReason}>
        Add a prospect
      </Button>
    );
  }
  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button onClick={() => { setOpen(true); setMsg(null); }}>Add a prospect</Button>
        {msg?.ok && <p role="status" className="text-[11px] text-success">{msg.message}</p>}
      </div>
    );
  }
  const field = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-next";
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await submitProspectAction({ businessName: name, category });
          setMsg(r);
          if (r.ok) {
            setName("");
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <label className="flex min-w-0 flex-1 basis-44 flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        Business
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required className={`${field} normal-case`} />
      </label>
      <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        Kind
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} normal-case`}>
          {STUDENT_CATEGORIES.map(([c, l]) => (
            <option key={c} value={c}>{l}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40">
        {pending ? "Sending…" : "Send to SponsorX"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-xs text-muted hover:text-text">Cancel</button>
      {msg && !msg.ok && <p role="status" className="basis-full text-[11px] text-danger">{msg.message}</p>}
    </form>
  );
}
