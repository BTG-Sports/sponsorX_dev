"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { btn, DialogError, NoteField, OrderDialog } from "@/components/order-dialog";
import { useDialogFocus } from "@/components/use-dialog-focus";
import { useMounted } from "@/components/use-mounted";
import { loadDealAgreementAction, reportDealMessageAction, signDealAgreementAction } from "@/server/deal-chat-actions";
import {
  agreementHref, confirmationsFor, dealUsd, isEnded, otherSide, sideName, signedWords,
  type ApiDealAgreement, type ApiDealChat, type DealViewer,
} from "@/lib/deal-chat";

import { SAMPLE_NOTE, sampleAgreement } from "@/lib/deal-chat-sample";

import { Glyph } from "./chat-bits";

/* --------------------------------------------------------------------------
   Deal Chat's three dialogs: the agreement (read it, tick the confirmations,
   sign), calling the deal off, and reporting a message to BTG. Each is
   portaled to <body> like every other dialog here, so a chat window or a
   card with a backdrop filter never clips it.
   -------------------------------------------------------------------------- */

/** The agreement: its exact text, who has signed, and — for whoever may — the confirmations and the Sign button. */
export function AgreementDialog({ chat, viewer, onClose, onSigned, sample = false }: {
  chat: ApiDealChat;
  viewer: DealViewer;
  /** The `?demo=sample` preview: a sample text, and nothing is signed. */
  sample?: boolean;
  onClose: () => void;
  /** After a signature: the chat is read again, the order may have moved on. */
  onSigned: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const mounted = useMounted();
  const agreementId = chat.agreement?.id ?? "";
  const [agreement, setAgreement] = useState<ApiDealAgreement | null>(() => (sample ? sampleAgreement(chat, Date.now()) : null));
  const [error, setError] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    let live = true;
    if (!agreementId || sample) return;
    void loadDealAgreementAction(agreementId)
      .catch(() => ({ ok: false as const, message: "We couldn't reach SponsorX. Close this and try again." }))
      .then((r) => {
        if (!live) return;
        if (r.ok) setAgreement(r.agreement);
        else setError(r.message);
      });
    return () => {
      live = false;
    };
  }, [agreementId, sample]);

  if (!mounted) return null;

  const you = chat.yourSide;
  const signed = agreement ? signedWords(agreement, chat) : null;
  const open = agreement?.state === "OPEN" && !isEnded(chat);
  const maySign = !!you && chat.mayAccept && open && !signed?.youSigned;
  const confirmations = you ? confirmationsFor(you, viewer) : [];
  const allTicked = confirmations.every((_, i) => ticks[i]);

  const sign = async () => {
    if (!agreement || !maySign || !allTicked || inFlight.current) return;
    if (sample) return setError(SAMPLE_NOTE);
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await signDealAgreementAction(agreement.id, agreement.bodyHash, chat.orderId).catch(() => ({ ok: false as const, message: "We couldn't reach SponsorX. Nothing was signed. Try again." }));
      if (r.ok) {
        setAgreement(r.agreement);
        onSigned();
      } else {
        setError(r.message);
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return createPortal(
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="sx-dc-agr-title">
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/65" />
      <div className="absolute inset-0 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
        <div className="sx-pop sx-dc sx-dc-agr">
          <header className="sx-dc-agr-head">
            <span className="sx-dc-agr-mark"><Glyph name="file" size={20} /></span>
            <div className="min-w-0">
              <h2 id="sx-dc-agr-title">Deal agreement</h2>
              <p>Order {chat.orderRef} · {chat.sponsorName} and {chat.sellerName}</p>
            </div>
            <button type="button" className="sx-dc-icon" aria-label="Close" onClick={onClose}><Glyph name="x" /></button>
          </header>

          {!agreement && !error && (
            <div className="sx-dc-agr-body" role="status" aria-label="Loading the agreement">
              <div className="sx-dc-ghost" style={{ height: 14, width: "40%" }} />
              <div className="sx-dc-ghost" style={{ height: 220, marginTop: 12 }} />
              <div className="sx-dc-ghost" style={{ height: 14, width: "70%", marginTop: 12 }} />
            </div>
          )}

          {agreement && signed && (
            <div className="sx-dc-agr-body">
              {agreement.state === "WITHDRAWN" && <p className="sx-dc-note" data-tone="warn">This form was replaced by a newer one in the chat. Close this and open the latest form.</p>}
              <dl className="sx-dc-agr-facts">
                <div><dt>Amount to pay</dt><dd>{dealUsd(agreement.amountCents)}</dd></div>
                {agreement.originalAmountCents !== agreement.amountCents && <div><dt>Original amount</dt><dd>{dealUsd(agreement.originalAmountCents)}</dd></div>}
                <div><dt>Status</dt><dd>{agreement.state === "SIGNED" ? "Signed by both" : agreement.state === "OPEN" ? "Waiting for signatures" : "Replaced"}</dd></div>
              </dl>
              <div className="sx-dc-agr-text" tabIndex={0} aria-label="The agreement's text">{agreement.body}</div>
              <ul className="sx-dc-agr-signs">
                <li data-done={agreement.sponsorSignedAt ? "" : undefined}><Glyph name={agreement.sponsorSignedAt ? "check" : "clock"} size={15} />{signed.sponsor}</li>
                <li data-done={agreement.sellerSignedAt ? "" : undefined}><Glyph name={agreement.sellerSignedAt ? "check" : "clock"} size={15} />{signed.seller}</li>
              </ul>

              {maySign && (
                <fieldset className="sx-dc-agr-ticks">
                  <legend>Confirm before you sign</legend>
                  {confirmations.map((text, i) => (
                    <label key={text}>
                      <input type="checkbox" checked={!!ticks[i]} onChange={(e) => setTicks((t) => ({ ...t, [i]: e.target.checked }))} />
                      <span>{text}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {you && open && !chat.mayAccept && !signed.youSigned && (
                <p className="sx-dc-note" data-tone="info">
                  {you === "SELLER" ? "Only your parent or guardian can sign this agreement. Ask them to sign in and open this chat." : "Only a Sponsor Admin can sign this agreement."}
                </p>
              )}
              {you && signed.youSigned && agreement.state === "OPEN" && (
                <p className="sx-dc-note" data-tone="good">You signed. Waiting for {sideName(chat, otherSide(you))} to sign.</p>
              )}
              {agreement.state === "SIGNED" && (
                <p className="sx-dc-note" data-tone="good">
                  Signed by both{you === "SPONSOR" ? ". Pay on the order page to lock in the dates." : you === "SELLER" ? ": waiting for the sponsor's payment." : "."}
                </p>
              )}
            </div>
          )}

          <DialogError message={error} />

          <footer className="sx-dc-agr-foot">
            {agreement && !sample && (
              <a className={btn.quiet} href={agreementHref(agreement.id)}>
                <Glyph name="download" size={16} className="mr-1.5" />Download PDF
              </a>
            )}
            <span className="grow" />
            <button type="button" className={btn.quiet} onClick={onClose}>Close</button>
            {maySign && (
              <button type="button" className={btn.primary} disabled={busy || !allTicked} onClick={sign}>
                {busy ? "Signing…" : "Sign the agreement"}
              </button>
            )}
          </footer>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Calling the deal off: a reason the other side reads; the order is cancelled, nothing is charged (spec §3.5). */
export function CallOffDialog({ chat, onClose, onCallOff }: {
  chat: ApiDealChat;
  onClose: () => void;
  onCallOff: (reason: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const other = chat.yourSide ? sideName(chat, otherSide(chat.yourSide)) : "the other side";

  const submit = async () => {
    if (!reason.trim() || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await onCallOff(reason.trim());
      if (r.ok) onClose();
      else setError(r.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <OrderDialog id="sx-dc-off" title="Call the deal off?" onClose={onClose} onSubmit={submit}>
      <p className="text-[13px] leading-relaxed text-muted">
        Order {chat.orderRef} is cancelled for everyone on it, its dates go back on sale and nothing is charged. This can&apos;t be undone.
      </p>
      <NoteField id="sx-dc-off-reason" label="Why are you calling it off?" hint={`${other} reads this.`} value={reason} onChange={setReason} />
      <DialogError message={error} />
      <div className="flex items-center justify-end gap-2">
        <button type="button" className={btn.quiet} onClick={onClose}>Keep the deal</button>
        <button type="submit" className={btn.danger} disabled={busy || !reason.trim()}>{busy ? "Calling it off…" : "Call the deal off"}</button>
      </div>
    </OrderDialog>
  );
}

/** Reporting a message: it goes to BTG's desk, with an optional reason. */
export function ReportDialog({ messageId, excerpt, onClose, sample = false }: { messageId: string; excerpt: string; onClose: () => void; sample?: boolean }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const inFlight = useRef(false);

  const submit = async () => {
    if (sent) return onClose();
    if (sample) return setError(SAMPLE_NOTE);
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const r = await reportDealMessageAction(messageId, reason).catch(() => ({ ok: false as const, message: "We couldn't reach SponsorX. Nothing was reported. Try again." }));
      if (r.ok) setSent(true);
      else setError(r.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <OrderDialog id="sx-dc-report" title={sent ? "Reported to BTG" : "Report this message to BTG?"} onClose={onClose} onSubmit={submit}>
      <blockquote className="rounded-lg border border-line bg-bg px-3 py-2 text-[13px] leading-relaxed text-muted">{excerpt}</blockquote>
      {sent ? (
        <p className="text-[13px] leading-relaxed text-muted">A BTG person reads it and decides what happens. You can keep talking in the meantime.</p>
      ) : (
        <NoteField id="sx-dc-report-reason" label="What's wrong with it?" required={false} rows={2} value={reason} onChange={setReason} />
      )}
      <DialogError message={error} />
      <div className="flex items-center justify-end gap-2">
        {!sent && <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>}
        <button type="submit" className={btn.primary} disabled={busy}>{sent ? "Done" : busy ? "Reporting…" : "Report to BTG"}</button>
      </div>
    </OrderDialog>
  );
}
