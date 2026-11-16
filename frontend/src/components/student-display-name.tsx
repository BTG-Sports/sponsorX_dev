"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "./ui";
import { updateDisplayNameAction, type DisplayNameResult } from "@/app/(app)/next/actions";
import { displayNameProblem } from "@/lib/students-live";

/* POL-FE-101 — the one field a NEXT student changes on their own profile.
   The name shows on the student's pages, to their advisor and to a business
   that opens their /s/ link, so the form says so. The API (PATCH
   /students/me) has the last word on what's allowed; the same rule runs here
   first so a mistake is named before sending. `disabledReason` keeps it shut
   (a BTG preview, or a student who has left). */

export function DisplayNameForm({ current, disabledReason }: { current: string; disabledReason?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(current);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<DisplayNameResult | null>(null);

  if (disabledReason) {
    return (
      <Button variant="secondary" disabled title={disabledReason}>
        Change display name
      </Button>
    );
  }
  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button variant="secondary" onClick={() => { setName(current); setOpen(true); setMsg(null); }}>
          Change display name
        </Button>
        {msg?.ok && (
          <p role="status" className="text-[11px] text-success">
            Saved. You&rsquo;re shown as {msg.displayName}.
          </p>
        )}
      </div>
    );
  }
  const problem = name.trim() === current ? null : displayNameProblem(name);
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await updateDisplayNameAction({ displayName: name });
          setMsg(r);
          if (r.ok) {
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        Display name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          autoComplete="nickname"
          aria-invalid={problem ? true : undefined}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs normal-case outline-none focus-visible:ring-2 focus-visible:ring-next"
        />
      </label>
      <button
        type="submit"
        disabled={pending || Boolean(problem) || name.trim() === current}
        className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-xs text-muted hover:text-text">
        Cancel
      </button>
      <p className="basis-full text-[10px] text-faint">
        This is the name on your pages, on your advisor&rsquo;s list and on your code&rsquo;s link. Your legal name doesn&rsquo;t change.
      </p>
      {problem && <p role="status" className="basis-full text-[11px] text-warn">{problem}</p>}
      {msg && !msg.ok && <p role="status" className="basis-full text-[11px] text-danger">{msg.message}</p>}
    </form>
  );
}
