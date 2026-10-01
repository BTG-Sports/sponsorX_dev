"use client";

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  keepOfferAction, reviseOfferAction, sendOfferAction, withdrawOfferAction,
} from "@/app/(app)/admin/offers/actions";
import {
  READ_ONLY_TIP, answerer, dayOf, firstName, isExpired, money, openRequests, orderHref, revisedInto, sendSummary,
  type ApiStaffOffer,
} from "@/lib/admin-offers-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   The offer page's actions — 2S2-FE-03, BTG half (design Offers.dc.html,
   views offerReq / revise / keep / draft / send / accepted / minor /
   withdraw). One thing per state:

     SENT with a change request  "Send a revised offer" (POST /offers/:id/revise
                                 → opens the new draft) or "Keep the offer as
                                 it is" (POST …/change-requests/:requestId/keep
                                 with a reply — every open request)
     DRAFT                       "Send to …" (POST /offers/:id/send) and Edit
     SENT, waiting               Withdraw (POST /offers/:id/withdraw)
     ACCEPTED                    "Open the order →" — the campaign's board
   Sales reads offers but writes none: their buttons are off, with the reason.
   -------------------------------------------------------------------------- */

const primaryBtn = "inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const quietBtn = "inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
const dangerBtn = "inline-flex min-h-11 items-center justify-center rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40";

type Open = null | "revise" | "keep" | "send" | "withdraw";

export function OfferDeskActions({ offer: o, canWrite }: { offer: ApiStaffOffer; canWrite: boolean }) {
  const [open, setOpen] = useState<Open>(null);
  const first = firstName(o.athlete.name);
  const who = answerer(o.athlete);
  const requests = openRequests(o);
  const expired = isExpired(o);
  const lock = canWrite ? undefined : READ_ONLY_TIP;
  const revised = revisedInto(o);

  let hint: string;
  let body: ReactNode = null;
  if (o.state === "SENT" && requests.length) {
    hint = `${who === o.athlete.name ? first : who} asked for a change. Choose one:`;
    body = (
      <div className="grid gap-2.5">
        <Choice title="Change the terms" text="Withdraws this offer and opens a copy you can edit.">
          <button type="button" className={primaryBtn} disabled={!canWrite} title={lock} onClick={() => setOpen("revise")}>Send a revised offer</button>
        </Choice>
        <Choice title="Keep these terms" text={`Reply to ${who === o.athlete.name ? first : who}. The offer stays open.`}>
          <button type="button" className={quietBtn} disabled={!canWrite || expired}
            title={lock ?? (expired ? "This offer has expired — send a revised offer instead." : undefined)} onClick={() => setOpen("keep")}>
            Keep the offer as it is
          </button>
        </Choice>
      </div>
    );
  } else if (o.state === "DRAFT") {
    hint = "A draft. Nothing has been sent.";
    body = (
      <div className="flex flex-col gap-2.5">
        <button type="button" className={primaryBtn} disabled={!canWrite} title={lock} onClick={() => setOpen("send")}>Send to {first}</button>
        {canWrite ? (
          <Link href={`/admin/offers/${o.id}/edit`} className={quietBtn}>Edit</Link>
        ) : (
          <button type="button" className={quietBtn} disabled title={lock}>Edit</button>
        )}
      </div>
    );
  } else if (o.state === "SENT") {
    hint = expired ? `Expired ${dayOf(o.expiresAt)} without an answer. ${first} can no longer accept it.` : `Waiting for ${who}. Nothing needs you.`;
    body = <button type="button" className={dangerBtn} disabled={!canWrite} title={lock} onClick={() => setOpen("withdraw")}>Withdraw</button>;
  } else if (o.state === "ACCEPTED") {
    hint = "Accepted. Nothing to do here.";
    body = <Link href={orderHref(o)} className="text-[13px] font-semibold text-primary-soft hover:underline">Open the order →</Link>;
  } else {
    hint = o.state === "DECLINED" ? "Declined. Nothing to do here." : "Withdrawn. Nothing to do here.";
    if (revised) body = <Link href={`/admin/offers/${revised}`} className="text-[13px] font-semibold text-primary-soft hover:underline">Open the revised offer →</Link>;
  }

  const close = () => setOpen(null);
  const guardianToo = o.athlete.guardianAnswers && o.athlete.guardianName ? ` and ${o.athlete.guardianName}` : "";

  return (
    <>
      <aside aria-label="Actions" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">{hint}</p>
        {body}
      </aside>

      {open === "revise" && (
        <Confirm id="rv" title="Send a revised offer?" onClose={close} cancel="Cancel" go="Withdraw and open the copy" primary
          intro="This is what happens:"
          points={[
            `This offer is withdrawn. ${first} can no longer accept it, and ${guardianToo ? `${first}${guardianToo} are` : "is"} emailed that a revised offer is coming.`,
            `A new draft opens with every term copied: the brief, ${money(o.compensation)} pay, ${money(o.sellPrice)} sell price, ${o.deliverables.length === 1 ? "the deliverable and its date" : `all ${o.deliverables.length} deliverables and their dates`}, usage rights, exclusivity, disclosures and the ${dayOf(o.expiresAt)} expiry.`,
            "Nothing is sent until you press Send on the new draft.",
          ]}
          run={async () => {
            const r = await reviseOfferAction(o.id);
            return r.ok ? { go: `/admin/offers/${r.id}` } : { error: r.message };
          }}
        />
      )}
      {open === "keep" && (
        <KeepDialog offer={o} to={who === o.athlete.name ? first : who} requestIds={requests.map((r) => r.id)} onClose={close} />
      )}
      {open === "send" && (
        <Confirm id="sd" title={`Send this offer to ${first}?`} onClose={close} cancel="Cancel" go={`Send to ${first}`} primary
          lead={`Once sent, these terms are fixed. ${o.athlete.guardianAnswers && o.athlete.guardianName ? `${o.athlete.guardianName} is emailed to answer for ${first}, and` : `${first} is emailed and`} can accept, decline or ask for a change.`}
          small={sendSummary(o)}
          run={async () => {
            const r = await sendOfferAction(o.id);
            return r.ok ? { refresh: true } : { error: r.message };
          }}
        />
      )}
      {open === "withdraw" && (
        <Confirm id="wd" title="Withdraw this offer?" onClose={close} cancel="Cancel" go="Withdraw"
          lead={`${first} can no longer accept it. Nothing else changes.`}
          run={async () => {
            const r = await withdrawOfferAction(o.id);
            return r.ok ? { go: "/admin/offers?tab=withdrawn" } : { error: r.message };
          }}
        />
      )}
    </>
  );
}

function Choice({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-bg px-3.5 py-3">
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="text-xs leading-normal text-muted">{text}</p>
      {children}
    </div>
  );
}

type Outcome = { go: string } | { refresh: true } | { error: string };

function Shell({ id, title, onClose, children }: { id: string; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <section className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl">
          <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
          {children}
        </section>
      </div>
    </div>
  );
}

function Confirm({ id, title, intro, lead, points, small, cancel, go, primary, onClose, run }: {
  id: string; title: string; intro?: string; lead?: string; points?: string[]; small?: string; cancel: string; go: string; primary?: boolean;
  onClose: () => void; run: () => Promise<Outcome>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const r = await run();
      if ("error" in r) return setError(r.error);
      onClose();
      if ("go" in r) router.push(r.go);
      else router.refresh();
    });
  return (
    <Shell id={id} title={title} onClose={onClose}>
      {intro && <p className="text-xs leading-normal text-muted">{intro}</p>}
      {lead && <p className="text-sm leading-relaxed">{lead}</p>}
      {points && (
        <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text">
          {points.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {small && <p className="text-xs leading-normal text-muted">{small}</p>}
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" data-autofocus onClick={onClose} className={quietBtn}>{cancel}</button>
        <button type="button" onClick={submit} disabled={pending} className={primary ? primaryBtn : dangerBtn}>{pending ? "Working…" : go}</button>
      </div>
    </Shell>
  );
}

function KeepDialog({ offer: o, to, requestIds, onClose }: { offer: ApiStaffOffer; to: string; requestIds: string[]; onClose: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    setError(null);
    if (!note.trim()) return setError(`Write a reply — ${to} is emailed it exactly as written.`);
    start(async () => {
      const r = await keepOfferAction(o.id, requestIds, note);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <Shell id="kp" title="Keep the offer as it is?" onClose={onClose}>
      <form className="flex flex-col gap-3.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <p className="text-xs leading-normal text-muted">
          Your reply is emailed to {to} exactly as written. The offer stays open for {to} to accept or decline until {dayOf(o.expiresAt)}.
        </p>
        <label htmlFor="kp-reply" className="text-[13px] font-semibold">Reply to {to} <span className="font-medium text-warn">(required)</span></label>
        <textarea id="kp-reply" rows={3} required maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
          className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
        {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" data-autofocus onClick={onClose} className={quietBtn}>Cancel</button>
          <button type="submit" disabled={pending} className={primaryBtn}>{pending ? "Sending…" : "Send reply and keep the offer"}</button>
        </div>
      </form>
    </Shell>
  );
}
