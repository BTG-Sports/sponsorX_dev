"use client";

import { useState, useTransition } from "react";

import { Button, Card } from "./ui";
import { claimProfileAction } from "@/app/(public)/athletes/[slug]/actions";

/* --------------------------------------------------------------------------
   P1-FE-28 / P9-FE-08 — the claim entry point on a FEATURED profile.

   The copy carries the whole consent model, because a featured athlete who
   believes they are signed is the misunderstanding it exists to prevent:
   claiming is step one of three (you → your school → a guardian, if you're
   under 18), and none of the three is representation. Nothing on this card
   says "join", "sign" or "partner".
   -------------------------------------------------------------------------- */

const STEPS = [
  { who: "You", what: "Tell us this profile is you. That's all this form does." },
  { who: "Your school", what: "Your school checks you're on its roster and confirms it." },
  { who: "A parent or guardian", what: "If you're under 18, they authorise anything commercial — nothing happens without them." },
];

export function ClaimProfile({ slug, name }: { slug: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", email: "", birthDate: "" });

  const field = "rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-next";

  if (done) {
    return (
      <Card className="border-success/30 bg-success/5" >
        <p role="status" className="text-sm font-semibold">Claim received</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Your school checks it next. You are not signed with anyone, and nobody represents you — this profile stays
          editorial until every step is done, and anything commercial needs its own yes.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-next/30">
      <p className="text-sm font-semibold">Is this you, {name.split(" ")[0]}?</p>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Claiming lets you correct and control this page. <strong className="font-semibold text-text">It does not sign you, and it does not
        mean anyone represents you.</strong>
      </p>
      <ol className="mt-3 space-y-2">
        {STEPS.map((s, i) => (
          <li key={s.who} className="flex gap-2.5 text-xs">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-next/15 text-[10px] font-semibold text-next">{i + 1}</span>
            <span>
              <span className="font-medium">{s.who}</span> <span className="text-muted">— {s.what}</span>
            </span>
          </li>
        ))}
      </ol>
      {!open ? (
        <div className="mt-4">
          <Button onClick={() => setOpen(true)}>Claim this profile</Button>
        </div>
      ) : (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErr(null);
            start(async () => {
              const r = await claimProfileAction(slug, f);
              if (r.ok) setDone(true);
              else setErr(r.message);
            });
          }}
        >
          <label className="grid gap-1 text-[11px] font-medium text-muted">
            Your full legal name
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={200} autoComplete="name" className={field} />
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-muted">
            Email (yours or a parent&rsquo;s)
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required maxLength={200} autoComplete="email" className={field} />
          </label>
          <label className="grid gap-1 text-[11px] font-medium text-muted">
            Date of birth <span className="font-normal text-faint">— tells us whether a guardian is needed</span>
            <input type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} className={field} />
          </label>
          {err && <p role="alert" className="text-xs text-danger">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40">
              {pending ? "Sending…" : "Send my claim"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="px-2 py-2 text-sm text-muted hover:text-text">Cancel</button>
          </div>
          <p className="text-[10px] leading-relaxed text-faint">
            We use this only to check the claim with your school. It isn&rsquo;t shown on the page.
          </p>
        </form>
      )}
    </Card>
  );
}
