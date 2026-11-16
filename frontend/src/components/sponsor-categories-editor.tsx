"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { BrandCategory } from "@/lib/brand-categories";
import { categoryOptions } from "@/lib/sponsor-requests-live";

/* --------------------------------------------------------------------------
   POL-FE-72 — BTG corrects a sponsor's business type after the account is
   open (PUT /sponsors/:id/categories, BTG staff only; audited
   `sponsor.setCategories`). It is what the clash check reads, so a wrong one
   hides the sponsor's briefs from athletes who would have taken them — or
   shows them to athletes who said no to that category.
   -------------------------------------------------------------------------- */

type Result = { ok: true; categories: string[] } | { ok: false; message: string };

export function SponsorCategoriesEditor({
  sponsorId,
  initial,
  save,
}: {
  sponsorId: string;
  initial: readonly BrandCategory[];
  save: (sponsorId: string, categories: BrandCategory[]) => Promise<Result>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<BrandCategory[]>([...initial]);
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (c: BrandCategory) => setPicked((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const same = picked.length === initial.length && picked.every((c) => initial.includes(c));
  const problem = !picked.length ? "Pick at least one business type." : picked.length > 10 ? "Pick at most 10." : null;

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setOpen(true); setNote(null); }} className="min-h-9 rounded-lg border border-line px-3 text-[12px] font-medium text-text hover:bg-surface-2">
          Change business type
        </button>
        {note && <p role="status" className={`text-[11px] ${note.ok ? "text-accent" : "text-danger"}`}>{note.text}</p>}
      </div>
    );
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold">Business type</legend>
      <div className="flex flex-wrap gap-2">
        {categoryOptions(initial).map((c) => {
          const on = picked.includes(c.value);
          return (
            <label key={c.value} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-line text-muted hover:text-text"}`}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(c.value)} />
              <span aria-hidden="true">{on ? "✓" : "+"}</span>
              {c.label}
            </label>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">The clash check uses this from the next brief on. Briefs already sent stay as they are.</p>
      {problem && <p role="alert" className="text-[11px] text-warn">{problem}</p>}
      {note && !note.ok && <p role="alert" className="text-[11px] text-danger">{note.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || same || problem !== null}
          onClick={() =>
            start(async () => {
              const r = await save(sponsorId, picked);
              if (!r.ok) return setNote({ text: r.message, ok: false });
              setOpen(false);
              setNote({ text: "Business type saved.", ok: true });
              router.refresh();
            })
          }
          className="min-h-9 rounded-lg bg-primary px-3 text-[12px] font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setPicked([...initial]); setNote(null); }} className="min-h-9 rounded-lg border border-line px-3 text-[12px] font-medium text-text hover:bg-surface-2">
          Cancel
        </button>
      </div>
    </fieldset>
  );
}
