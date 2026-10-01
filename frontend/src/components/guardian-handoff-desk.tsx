"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { handoffDocumentAction, staffDecisionAction } from "@/app/(app)/admin/guardian-handoffs/actions";
import { confirmPoints, documentSub, type ApiDeskHandoff, type ApiHandoffStaff } from "@/lib/guardian-handoffs-desk-live";
import { momentOf } from "@/lib/new-signups-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   BTG's decision on a guardian handoff, and the new guardian's documents —
   2S1-FE-10, BTG half (design GuardianHandoffs.dc.html, states HO-3 detail,
   HO-4 confirm, HO-5 decline, HO-8 viewer). Live (2S1-BE-15):

   - "Confirm the switch" and "Decline" (a required reason the new guardian
     reads exactly as written) post through staffDecisionAction
     (POST /guardian-handoffs/:id/staff-decision); the page then re-reads.
     Only a HANDED_OFF request has them; anything else is read only.
   - Documents open in the viewer through a five-minute link the API signs
     and records (handoffDocumentAction) — fetched when it is opened, never
     before, and never stored.
   -------------------------------------------------------------------------- */

export function HandoffDecision({ handoff, staffConfirmMinors }: { handoff: ApiDeskHandoff; staffConfirmMinors: boolean | null }) {
  const [open, setOpen] = useState<null | "confirm" | "decline">(null);
  const cur = handoff.current.firstName;
  const waiting = handoff.state === "HANDED_OFF";
  return (
    <>
      <aside aria-label="Decision" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        {waiting ? (
          <>
            <p className="text-xs text-muted">
              {cur} handed off.{" "}
              {staffConfirmMinors === false
                ? "BTG staff confirm minors was on when they did, so it still waits for you."
                : "BTG staff confirm minors is on, so it waits for you."}
            </p>
            <button type="button" onClick={() => setOpen("confirm")}
              className="min-h-12 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
              Confirm the switch
            </button>
            <button type="button" onClick={() => setOpen("decline")}
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10">
              Decline
            </button>
          </>
        ) : handoff.state === "REQUESTED" || handoff.state === "WAITING" ? (
          <p className="text-[13px] leading-relaxed text-muted">
            Read only. {handoff.state === "WAITING" ? `${cur} answers this request, not BTG.` : `${handoff.requester.firstName} hasn’t sent this request yet.`}
          </p>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted">Read only. Nothing to do.</p>
        )}
      </aside>

      {open === "confirm" && <ConfirmDialog handoff={handoff} onClose={() => setOpen(null)} />}
      {open === "decline" && <DeclineDialog handoff={handoff} onClose={() => setOpen(null)} />}
    </>
  );
}

function ConfirmDialog({ handoff, onClose }: { handoff: ApiDeskHandoff; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await staffDecisionAction(handoff.id, "CONFIRM");
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="cf-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id="cf-title" className="text-lg font-semibold">Confirm the switch to {handoff.requester.name}?</h2>
          <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed">
            {confirmPoints(handoff).map((p) => <li key={p}>{p}</li>)}
          </ul>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={pending} onClick={submit}
              className="min-h-12 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? "Switching…" : "Confirm the switch"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeclineDialog({ handoff, onClose }: { handoff: ApiDeskHandoff; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [why, setWhy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const req = handoff.requester.firstName;
  const off = !why.trim();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await staffDecisionAction(handoff.id, "DECLINE", why);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="dl-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <div className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id="dl-title" className="text-lg font-semibold">Decline {handoff.requester.name}&rsquo;s request?</h2>
          <label htmlFor="dl-why" className="text-[13px] font-semibold">Reason for {req} <span className="font-medium text-warn">(required)</span></label>
          <p id="dl-hint" className="-mt-2 text-[11px] text-muted">{req} reads this exactly as written.</p>
          <textarea id="dl-why" rows={3} required aria-describedby="dl-hint" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={1000}
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs">Nothing changes on {handoff.athlete.firstName}&rsquo;s account. {req} can contact BTG support.</p>
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">Cancel</button>
            <button type="button" disabled={pending || off} onClick={submit}
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? "Declining…" : "Send and decline"}
            </button>
          </div>
          {off && <p className="text-[11px] text-muted">Write a reason to turn on &ldquo;Send and decline&rdquo;.</p>}
        </div>
      </div>
    </div>
  );
}

/** The new guardian's government ID and proof of guardianship, each behind the 5-minute viewer. */
export function HandoffDocuments({ id, documents }: { id: string; documents: ApiHandoffStaff["documents"] }) {
  const [open, setOpen] = useState<ApiHandoffStaff["documents"][number] | null>(null);
  return (
    <section aria-label="Documents" className="rounded-xl border border-line bg-surface p-4 sm:px-5">
      <h2 className="text-sm font-semibold">Documents</h2>
      {documents.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No documents uploaded yet.</p>
      ) : (
        <ul className="mt-2">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 border-t border-line-soft py-2.5 text-[13px]">
              <span className="min-w-0 flex-1">
                {d.label}
                <span className="block break-words text-[11px] text-muted">{documentSub(d)}</span>
              </span>
              {d.uploadedAt ? (
                <button type="button" onClick={() => setOpen(d)} aria-label={`View ${d.label}`}
                  className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">
                  View
                </button>
              ) : (
                <span className="text-[11px] text-muted">Not uploaded yet</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-faint">Each view opens a link that expires in 5 minutes. Views are recorded.</p>
      {open && <Viewer id={id} doc={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Viewer({ id, doc, onClose }: { id: string; doc: ApiHandoffStaff["documents"][number]; onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const [link, setLink] = useState<{ url: string; at: string } | { error: string } | null>(null);
  const [pending, start] = useTransition();
  const title = [doc.label, documentSub(doc)].filter(Boolean).join(" · ");
  const load = () =>
    start(async () => {
      const r = await handoffDocumentAction(id, doc.id);
      setLink(r.ok ? { url: r.url, at: new Date().toISOString() } : { error: r.message });
    });
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="vw-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/90" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 sm:py-10">
        <div className="sx-pop relative flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
            <h2 id="vw-title" className="min-w-0 flex-1 break-words text-sm font-semibold">{title}</h2>
            <button type="button" data-autofocus onClick={onClose} className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2">Close</button>
          </div>
          <p role="status" className="border-b border-warn/30 bg-warn/8 px-4 py-2 text-xs font-semibold text-warn">
            <span aria-hidden="true">● </span>Link expires in 5 minutes · this view is recorded
          </p>
          {link && "url" in link ? (
            <>
              <iframe title={title} src={link.url} className="m-4 h-72 rounded-xl border border-line bg-bg sm:h-[28rem]" />
              <p className="px-4 pb-4 text-[11px] text-faint">Viewed by you · {momentOf(link.at)} · recorded in the activity history</p>
            </>
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
