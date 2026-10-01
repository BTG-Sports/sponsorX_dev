"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { signupDecisionAction, signupDocumentAction } from "@/app/(app)/admin/new-signups/actions";
import { cascadeWords, type ApiSignupDetail } from "@/lib/signups-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   One live sign-up's documents, actions and dialogs — 2S1-FE-07 (design
   NewSignups.dc.html, views athlete / guardian / reject / viewer), for the
   athletes and guardians 2S1-BE-09 / -10 approve automatically. The
   organization samples keep new-signup-review.tsx until 2S1-BE-06.

   - Documents open in the viewer through a five-minute link the API signs
     and records (signupDocumentAction) — fetched when View is pressed, never
     before, and never stored.
   - Approve (a held athlete), Reject (a required reason, emailed exactly as
     written) and Reinstate go through signupDecisionAction; the page then
     re-reads itself. A guardian's Reject names the athletes it takes with it.
   -------------------------------------------------------------------------- */

type Owner = "athletes" | "guardians";

export function LiveSignupReview({ signup, before, after }: { signup: ApiSignupDetail; before: ReactNode; after: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState<null | "reject" | { doc: string; name: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const owner: Owner = signup.kind === "ATHLETE" ? "athletes" : "guardians";
  const first = signup.name.split(/\s+/)[0] ?? signup.name;
  const cascade = cascadeWords(signup);

  const act = (decision: "approve" | "reinstate") =>
    start(async () => {
      setError(null);
      const r = await signupDecisionAction(owner, signup.id, decision);
      if (!r.ok) setError(r.message);
      else router.refresh();
    });

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        {before}
        <section aria-label="Documents" className="rounded-xl border border-line bg-surface p-4 sm:px-5">
          <h2 className="text-sm font-semibold">Documents</h2>
          {signup.documents.length === 0 ? (
            <p className="mt-2 text-xs text-muted">No documents uploaded.</p>
          ) : (
            <ul className="mt-2">
              {signup.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 border-t border-line-soft py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    {d.name}
                    <span className="block break-words text-[11px] text-muted">{d.sub}</span>
                  </span>
                  {d.viewable ? (
                    <button type="button" onClick={() => setOpen({ doc: d.id, name: d.name })} aria-label={`View ${d.name}`}
                      className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">
                      View
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted">Recorded</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-faint">Each view opens a link that expires in 5 minutes. Views are recorded.</p>
        </section>
        {after}
      </div>

      <aside aria-label="Actions" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        {signup.state === "NEEDS_REVIEW" ? (
          <>
            <p className="text-xs text-muted">Held for your review: {signup.reasons.join(" · ")}</p>
            {signup.missing.length > 0 && <p className="text-xs text-warn">Still waiting on the applicant: {signup.missing.join("; ")}.</p>}
            <button type="button" disabled={pending || !signup.can.approve || signup.missing.length > 0} onClick={() => act("approve")}
              title={signup.missing.length ? "They haven't finished every step yet." : undefined}
              className="min-h-11 rounded-lg bg-primary px-4 text-[13px] font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40">
              Approve {first}
            </button>
          </>
        ) : signup.state === "REJECTED" ? (
          <p className="text-xs text-muted">
            Rejected{signup.rejectNote ? `: “${signup.rejectNote}”` : "."}
            {signup.rejectedWithGuardian ? " Rejected with their guardian — reinstate the guardian to bring them back." : ""}
          </p>
        ) : (
          <p className="text-xs text-muted">{signup.state === "APPROVED" ? "Approved by BTG." : "Approved automatically."} Step in only if something is wrong.</p>
        )}
        <button type="button" disabled={pending || !signup.can.reject} onClick={() => setOpen("reject")}
          className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40">
          Reject {first}
        </button>
        <button type="button" disabled={pending || !signup.can.reinstate} onClick={() => act("reinstate")}
          title={signup.can.reinstate ? undefined : signup.state === "REJECTED" ? "Reinstate their guardian first." : "Reinstate is for rejected accounts."}
          className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40">
          Reinstate
        </button>
        <p className="text-[11px] text-faint">Reinstate is for rejected accounts. This one is {signup.state === "REJECTED" ? "rejected" : signup.state === "NEEDS_REVIEW" ? "held for review" : "active"}.</p>
        {signup.kind === "GUARDIAN" && (
          <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-xs leading-relaxed">Rejecting a guardian also rejects the athletes they look after.</p>
        )}
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      </aside>

      {open === "reject" && (
        <RejectDialog signup={signup} owner={owner} first={first} cascade={cascade} onClose={() => setOpen(null)} onDone={() => { setOpen(null); router.refresh(); }} />
      )}
      {open && open !== "reject" && <Viewer owner={owner} id={signup.id} doc={open.doc} name={open.name} who={signup.name} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RejectDialog({ signup, owner, first, cascade, onClose, onDone }: {
  signup: ApiSignupDetail; owner: Owner; first: string; cascade: string | null; onClose: () => void; onDone: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await signupDecisionAction(owner, signup.id, "reject", why);
      if (r.ok) onDone();
      else setError(r.message);
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="rj-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id="rj-title" className="text-lg font-semibold">Reject {signup.name}?</h2>
          {cascade && (
            <p role="alert" className="rounded-lg border border-warn/45 bg-warn/8 px-3 py-2.5 text-[13px] leading-relaxed">
              <strong className="text-warn">{cascade}</strong> Their listings stop and their payouts are held.
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted">
            Their sign-in is switched off, their listings end and their payouts are held. Money already earned stays owed. If they ask, BTG decides whether to reinstate them.
          </p>
          <label htmlFor="rj-why" className="text-[13px] font-semibold">Reason <span className="font-medium text-warn">(required)</span></label>
          <p id="rj-hint" className="-mt-2 text-[11px] text-muted">We email this to {first} exactly as written.</p>
          <textarea id="rj-why" rows={4} required aria-describedby="rj-hint" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={2000}
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          {error && <p role="alert" className="text-xs text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={pending || !why.trim()} onClick={submit}
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50">
              {pending ? "Rejecting…" : "Reject and email reason"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Viewer({ owner, id, doc, name, who, onClose }: { owner: Owner; id: string; doc: string; name: string; who: string; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [link, setLink] = useState<{ url: string } | { error: string } | null>(null);
  const [pending, start] = useTransition();
  const load = () =>
    start(async () => {
      const r = await signupDocumentAction(owner, id, doc);
      setLink(r.ok ? { url: r.url } : { error: r.message });
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="vw-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/90" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 sm:py-10">
        <div className="sx-pop relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
            <h2 id="vw-title" className="min-w-0 flex-1 text-sm font-semibold">{name} · {who}</h2>
            <button type="button" data-autofocus onClick={onClose} className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">Close</button>
          </div>
          <p role="status" className="border-b border-warn/30 bg-warn/8 px-4 py-2 text-xs font-semibold text-warn">
            <span aria-hidden="true">● </span>Link expires in 5 minutes · this view is recorded
          </p>
          {link && "url" in link ? (
            <iframe title={`${name} · ${who}`} src={link.url} className="m-4 h-72 rounded-xl border border-line bg-bg sm:h-[28rem]" />
          ) : (
            <div className="m-4 grid h-72 place-items-center rounded-xl border border-dashed border-line bg-bg px-4 text-center text-[13px] text-muted sm:h-[28rem]">
              <span className="space-y-3">
                <span className="block">Opening it signs a 5-minute link and records that you viewed it.</span>
                <button type="button" onClick={load} disabled={pending}
                  className="min-h-11 rounded-lg bg-primary px-4 text-[13px] font-semibold text-cta-ink hover:bg-primary-soft disabled:opacity-50">
                  {pending ? "Opening…" : "Open the document"}
                </button>
                {link && "error" in link && <span role="alert" className="block text-xs text-danger">{link.error}</span>}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
