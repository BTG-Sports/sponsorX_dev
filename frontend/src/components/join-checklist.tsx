"use client";

import { useEffect, useState, useTransition } from "react";

import { confirmIdAction, nameGuardianAction, requestIdAction, resendAction, signupStatusAction, type JoinAnswer } from "@/app/(public)/join/actions";
import { IdUpload } from "@/components/id-upload";
import { LinkExpired } from "@/components/link-expired";
import { checklist, needsGuardian, standing, type ApiSignupStatus } from "@/lib/join-signup";

/* --------------------------------------------------------------------------
   After applying — 2S1-FE-06 (athlete half). What is still needed before
   SponsorX approves the application by itself (2S1-BE-09 / -10), each step
   doable right here:

   - confirm the email (the link in the receipt; "Send it again");
   - the government ID — or, under the place's age of majority, a school ID
     — straight to the private bucket (IdUpload);
   - a minor names their guardian if the wizard didn't (the API decides
     "minor" by the place: Alabama's age is 19), and can email them again.

   Reads GET /applications/intake/status?token= on mount; every write answers
   with the new status. The intake token is the only key.
   -------------------------------------------------------------------------- */

const field = "mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
const smallBtn = "min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";

export function JoinChecklist({ token, initial }: { token: string; initial?: ApiSignupStatus }) {
  const [s, setS] = useState<ApiSignupStatus | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /* 2S8-FE-01: the link this device holds is older than 14 days (the API's 410). */
  const [expired, setExpired] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [g, setG] = useState({ legalName: "", email: "", relationship: "PARENT" as "PARENT" | "LEGAL_GUARDIAN" | "AUTHORIZED_REP" });

  useEffect(() => {
    if (initial) return;
    let live = true;
    void signupStatusAction(token).then((r) => {
      if (!live) return;
      if (r.ok) setS(r.data);
      else if ("expired" in r) setExpired(r.expired.kind);
      else setError(r.message);
    });
    return () => {
      live = false;
    };
  }, [token, initial]);

  if (expired) return <LinkExpired kind={expired} token={token} what="the sign-up link" level="h2" />;

  if (!s) {
    return (
      <p aria-live="polite" className={`text-sm ${error ? "text-danger" : "text-muted"}`}>
        {error ?? "Checking where your application stands…"}
      </p>
    );
  }

  const st = standing(s);
  const rows = checklist(s);
  const run = (f: () => Promise<JoinAnswer<ApiSignupStatus>>, done?: string) =>
    start(async () => {
      setError(null);
      setNote(null);
      const r = await f();
      if (!r.ok) return "expired" in r ? setExpired(r.expired.kind) : setError(r.message);
      setS(r.data);
      if (done) setNote(done);
    });

  return (
    <section aria-labelledby="jc-title" className="space-y-4 rounded-xl border border-line bg-surface-2 p-5">
      <div>
        <h2 id="jc-title" className={`text-base font-semibold ${st.tone === "success" ? "text-success" : st.tone === "warn" ? "text-text" : "text-muted"}`}>{st.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">{st.line}</p>
      </div>

      <ol className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-3 text-sm">
            <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${r.done ? "bg-success/15 text-success" : "border border-line text-faint"}`}>
              {r.done ? "✓" : ""}
            </span>
            <span className="min-w-0">
              <span className={r.done ? "text-text" : "font-medium text-text"}>{r.label}</span>
              <span className="sr-only">{r.done ? " — done" : " — still to do"}</span>
              {r.note && <span className="block text-xs text-muted">{r.note}</span>}
            </span>
          </li>
        ))}
      </ol>

      {!s.approved && !s.closed && (
        <div className="space-y-3 border-t border-line pt-4">
          {!s.emailConfirmed && (
            <button type="button" className={smallBtn} disabled={pending} onClick={() => run(() => resendAction(token, "email"), "Sent — check your inbox (and spam).")}>
              Send the confirmation email again
            </button>
          )}
          {!s.idUploaded && (
            <IdUpload
              title={s.idKind === "SCHOOL_ID" ? "Upload your school ID" : "Upload your government ID"}
              request={(f) => requestIdAction(token, s.idKind, f)}
              confirm={(id) => confirmIdAction(token, id)}
              onDone={(next) => setS(next)}
            />
          )}
          {needsGuardian(s) && (
            <form
              className="space-y-2.5"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => nameGuardianAction(token, g), "We’ve emailed your guardian a link to their own page.");
              }}
            >
              <p className="text-sm font-semibold">Your guardian</p>
              <label className="block text-xs font-medium">
                Guardian legal name
                <input className={field} value={g.legalName} onChange={(e) => setG({ ...g, legalName: e.target.value })} autoComplete="off" required />
              </label>
              <label className="block text-xs font-medium">
                Guardian email
                <input type="email" className={field} value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} autoComplete="off" required />
              </label>
              <label className="block text-xs font-medium">
                Relationship
                <select className={field} value={g.relationship} onChange={(e) => setG({ ...g, relationship: e.target.value as typeof g.relationship })}>
                  <option value="PARENT">Parent</option>
                  <option value="LEGAL_GUARDIAN">Legal guardian</option>
                  <option value="AUTHORIZED_REP">Authorized representative</option>
                </select>
              </label>
              <button type="submit" className={smallBtn} disabled={pending}>Email my guardian</button>
            </form>
          )}
          {s.guardian && !s.guardian.approved && (
            <button type="button" className={smallBtn} disabled={pending} onClick={() => run(() => resendAction(token, "guardian"), `Sent to ${s.guardian!.email}.`)}>
              Email {s.guardian.name.split(/\s+/)[0]} the link again
            </button>
          )}
        </div>
      )}
      {note && <p role="status" className="text-xs text-success">{note}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </section>
  );
}
