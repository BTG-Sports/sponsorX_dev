"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { lookupAction, startAction, type Lookup } from "@/app/(public)/guardian/handoff/actions";
import { RELATIONSHIPS, relationshipCode } from "@/lib/guardian-live";

/* --------------------------------------------------------------------------
   The new guardian starts a request — 2S1-FE-10 (design
   GuardianHandoff.dc.html, "request", steps 1 and 2). The only way a
   handoff starts (2S1-BE-15).

   1. Which athlete: the athlete's email, checked against the API (first
      names only come back — enough to know it's the right child).
   2. Your details. "Start my request" creates it and emails a confirmation
      link; the page then carries on at ?r=<token> with the documents and
      the agreement.
   -------------------------------------------------------------------------- */

const field =
  "mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const card = "rounded-xl border border-line bg-surface p-4 sm:p-5";

export function HandoffStartForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [athleteEmail, setAthleteEmail] = useState("");
  const [match, setMatch] = useState<Lookup | null>(null);
  const [form, setForm] = useState({ name: "", relationship: RELATIONSHIPS[0] as string, phone: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const check = () =>
    start(async () => {
      setError(null);
      setMatch(await lookupAction(athleteEmail).catch(() => ({ ok: false as const, message: "We couldn’t reach SponsorX just now." })));
    });

  const found = match?.ok && match.found ? match : null;
  const send = () =>
    start(async () => {
      setError(null);
      const r = await startAction({ athleteEmail, name: form.name, email: form.email, phone: form.phone, relationship: relationshipCode(form.relationship) })
        .catch(() => ({ ok: false as const, message: "We couldn’t reach SponsorX just now. Nothing was sent — try again." }));
      if (!r.ok) return setError(r.message);
      router.push(`/guardian/handoff?r=${encodeURIComponent(r.token)}`);
    });

  const a = found?.athlete.firstName ?? "the athlete";
  const valid = Boolean(found && form.name.trim() && /\S+@\S+\.\S+/.test(form.email));
  return (
    <div className="space-y-4">
      <section aria-label="Which athlete" className={`${card} space-y-3`}>
        <h2 className="text-sm font-semibold">1 · Which athlete?</h2>
        <label className="flex flex-col text-xs font-medium">
          The athlete&rsquo;s email
          <input type="email" className={field} placeholder="The email the athlete signed up with" autoComplete="off"
            value={athleteEmail} onChange={(e) => { setAthleteEmail(e.target.value); setMatch(null); }} />
        </label>
        <button type="button" onClick={check} disabled={pending || !athleteEmail.includes("@")}
          className="min-h-10 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40">
          Find the athlete
        </button>
        {found && (
          <p className="text-xs text-success" role="status">
            <span aria-hidden="true">✓ </span>Found: {found.athlete.firstName} · {found.athlete.sport} · guardian {found.current.firstName}
          </p>
        )}
        {match?.ok && !match.found && (
          <p className="text-xs text-warn" role="status">
            We couldn&rsquo;t find an athlete under 18 with a guardian for that email. Check it with the family, or contact BTG.
          </p>
        )}
        {match && !match.ok && <p role="alert" className="text-xs text-danger">{match.message}</p>}
      </section>

      {found && (
        <>
          <p className="rounded-lg border border-primary/35 bg-primary/7 px-3.5 py-3 text-sm leading-relaxed">
            {found.current.firstName}, {a}&rsquo;s current guardian, will be asked to approve.
          </p>
          <section aria-label="Your details" className={`${card} space-y-3`}>
            <h2 className="text-sm font-semibold">2 · Your details</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col text-xs font-medium">
                Full name
                <input type="text" className={field} autoComplete="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </label>
              <label className="flex flex-col text-xs font-medium">
                Relationship to {a}
                <select className={field} value={form.relationship} onChange={(e) => set("relationship", e.target.value)}>
                  {RELATIONSHIPS.map((x) => <option key={x}>{x}</option>)}
                </select>
              </label>
              <label className="flex flex-col text-xs font-medium">
                Phone <span className="font-normal text-muted">(optional)</span>
                <input type="tel" className={field} placeholder="Your phone number" autoComplete="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </label>
              <label className="flex flex-col text-xs font-medium">
                Email
                <input type="email" className={field} placeholder="Your email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </label>
            </div>
            <p className="text-xs text-muted">We&rsquo;ll email you a link to confirm this address. Then you upload your ID and proof, and accept the guardian agreement.</p>
          </section>
          <button type="button" onClick={send} disabled={pending || !valid} aria-busy={pending}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-cta-ink disabled:cursor-not-allowed disabled:opacity-40">
            {pending ? "Starting…" : "Start my request"}
          </button>
        </>
      )}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
