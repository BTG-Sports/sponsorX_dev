"use client";

import { useState, type ReactNode } from "react";

import { firstName, SIGNUP_BACKEND, type SignupDetail } from "@/lib/new-signups-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   One sign-up's documents, actions and dialogs — 2S1-FE-07 (design
   NewSignups.dc.html, views athlete / guardian / reject / viewer). A
   SCAFFOLD: the reject dialog and the document viewer open, so the screen
   can be walked through, but nothing is written — "Reject and email
   reason", Approve and Reinstate stay off until 2S1-BE-06 / -09 / -10, and
   the viewer loads no document and records no view.
   -------------------------------------------------------------------------- */

const OFF = `Goes live with ${SIGNUP_BACKEND} — this is sample data, nothing is sent or changed.`;

export function NewSignupReview({ signup, before, after }: { signup: SignupDetail; before: ReactNode; after: ReactNode }) {
  const [open, setOpen] = useState<null | "reject" | { doc: string }>(null);
  const first = firstName(signup.name);
  const held = signup.state === "NEEDS_REVIEW";
  const cascade = signup.kind === "GUARDIAN" && signup.guardianOf.length > 0;

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
                    <span className="block text-[11px] text-muted">{d.sub}</span>
                  </span>
                  <button type="button" onClick={() => setOpen({ doc: d.name })} aria-label={`View ${d.name}`}
                    className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">
                    View
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-faint">Each view opens a link that expires in 5 minutes. Views are recorded.</p>
        </section>
        {after}
      </div>

      <aside aria-label="Actions" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        {held ? (
          <>
            <p className="text-xs text-muted">Held for your review: {signup.reasons.join(" · ")}</p>
            <button type="button" disabled title={OFF}
              className="min-h-11 cursor-not-allowed rounded-lg bg-primary px-4 text-[13px] font-semibold text-cta-ink opacity-40">
              Approve {first}
            </button>
          </>
        ) : (
          <p className="text-xs text-muted">Approved automatically. Step in only if something is wrong.</p>
        )}
        <button type="button" onClick={() => setOpen("reject")}
          className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10">
          Reject {first}
        </button>
        <button type="button" disabled title={OFF}
          className="min-h-11 cursor-not-allowed rounded-lg border border-line px-4 text-[13px] font-medium text-text opacity-40">
          Reinstate
        </button>
        <p className="text-[11px] text-faint">Reinstate is for rejected accounts. This one is {held ? "held for review" : "active"}.</p>
        {cascade && (
          <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-xs leading-relaxed">Rejecting a guardian also rejects the athletes they look after.</p>
        )}
      </aside>

      {open === "reject" && <RejectDialog signup={signup} first={first} cascade={cascade} onClose={() => setOpen(null)} />}
      {open && open !== "reject" && <Viewer doc={open.doc} owner={signup.name} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RejectDialog({ signup, first, cascade, onClose }: { signup: SignupDetail; first: string; cascade: boolean; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [why, setWhy] = useState("");
  const kids = signup.guardianOf.map((k) => k.name);
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="rj-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id="rj-title" className="text-lg font-semibold">Reject {signup.name}?</h2>
          {cascade && (
            <p role="alert" className="rounded-lg border border-warn/45 bg-warn/8 px-3 py-2.5 text-[13px] leading-relaxed">
              <strong className="text-warn">This also rejects {kids.join(" and ")}.</strong> Their listings stop and their guardian link ends.
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted">
            Their account closes and their files are kept for 30 days. Agreed orders are reviewed by BTG one by one. If they ask, BTG decides whether to reinstate them.
          </p>
          <label htmlFor="rj-why" className="text-[13px] font-semibold">Reason <span className="font-medium text-warn">(required)</span></label>
          <p id="rj-hint" className="-mt-2 text-[11px] text-muted">We email this to {first} exactly as written.</p>
          <textarea id="rj-why" rows={4} required aria-describedby="rj-hint rj-off" value={why} onChange={(e) => setWhy(e.target.value)}
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="button" disabled title={OFF}
              className="min-h-11 cursor-not-allowed rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger opacity-50">
              Reject and email reason
            </button>
          </div>
          <p id="rj-off" className="text-[11px] text-warn">Sample — rejecting goes live with {SIGNUP_BACKEND}. Nothing is sent from here yet.</p>
        </div>
      </div>
    </div>
  );
}

function Viewer({ doc, owner, onClose }: { doc: string; owner: string; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="vw-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/90" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 sm:py-10">
        <div className="sx-pop relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
            <h2 id="vw-title" className="min-w-0 flex-1 text-sm font-semibold">{doc} · {owner}</h2>
            <button type="button" data-autofocus onClick={onClose} className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">Close</button>
          </div>
          <p role="status" className="border-b border-warn/30 bg-warn/8 px-4 py-2 text-xs font-semibold text-warn">
            <span aria-hidden="true">● </span>When live: the link expires in 5 minutes · each view is recorded
          </p>
          <div className="m-4 grid h-72 place-items-center rounded-xl border border-dashed border-line bg-bg px-4 text-center text-[13px] text-faint sm:h-[28rem]">
            <span>
              Document image shown here
              <br />
              at its original size, never stored on this device
            </span>
          </div>
          <p className="px-4 pb-4 text-[11px] text-warn">
            Sample — no document is loaded and no view is recorded. The live viewer opens a 5-minute audited link from the private bucket, with {SIGNUP_BACKEND}.
          </p>
        </div>
      </div>
    </div>
  );
}
