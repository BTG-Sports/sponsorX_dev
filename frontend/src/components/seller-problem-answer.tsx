"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { answerProblemAction, requestProofUploadAction, type ProblemAnswer } from "@/app/(app)/seller-sales-actions";
import { DeadlineChip } from "@/components/order-bits";
import { ANSWER_WINDOW_HOURS, CONFIRM_HOURS, answerQuote, deadline, money, stamp } from "@/lib/order-automation-live";
import { linkProblem, proofProblem } from "@/lib/seller-orders-live";
import { DialogError, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   2S4-FE-05 — the seller answers a problem the sponsor reported, within 72
   hours (SellerOrderActions.dc.html, views problem · redeliver · refund ·
   disagree · send). Live (2S4-BE-11):

     the photo   → requestProofUploadAction (POST /sales/:id/proof), then the
                   browser PUTs it straight to the private bucket
     the answer  → answerProblemAction (POST /sales/:id/problem-answer):
                   DELIVER_AGAIN (a new date and a note), REFUND (the whole
                   line — partial refunds are out of scope), or DISAGREE (a
                   note, an optional photo or https link)

   The sponsor then has 72 hours to accept or reject it; BTG decides only
   if they reject it, or if nobody answers.
   -------------------------------------------------------------------------- */

type Choice = "re" | "rf" | "dg";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function SellerProblemAnswer({ lineId, sponsor, problem, sellerDueAt, refundCents, now }: {
  lineId: string;
  sponsor: string;
  problem: { text: string | null; at: string };
  sellerDueAt: string;
  /** The line's total — a refund gives back the whole line. */
  refundCents: number;
  /** The server's time, so the first render matches. */
  now: string;
}) {
  const router = useRouter();
  const clock = new Date(now);
  const today = now.slice(0, 10);
  const latest = new Date(clock.getTime() + 90 * DAY).toISOString().slice(0, 10);
  /* The sponsor's 72 hours start when the answer is sent. */
  const sponsorBy = stamp(new Date(clock.getTime() + ANSWER_WINDOW_HOURS * HOUR).toISOString());

  const [pick, setPick] = useState<Choice | null>(null);
  const [dialog, setDialog] = useState<null | "refund" | "send">(null);
  const [newDate, setNewDate] = useState("");
  const [reNote, setReNote] = useState("");
  const [dgNote, setDgNote] = useState("");
  const [link, setLink] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [photo, setPhoto] = useState<{ key: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const file = useRef<HTMLInputElement>(null);

  const answer = (): ProblemAnswer | null => {
    if (pick === "re") return { answer: "DELIVER_AGAIN", newDate, note: reNote };
    if (pick === "rf") return { answer: "REFUND" };
    if (pick === "dg") return { answer: "DISAGREE", note: dgNote, proofKey: photo?.key ?? null, proofLink: link.trim() || null };
    return null;
  };

  /** Check the form before the confirm dialog opens — the API checks again. */
  const review = () => {
    setError(null);
    if (pick === "re") {
      if (!newDate) return setError("Pick the new date you’ll deliver on.");
      if (newDate < today || newDate > latest) return setError("The new date is today or later, within 90 days.");
      if (!reNote.trim()) return setError(`Add a note — ${sponsor} reads it.`);
    }
    if (pick === "dg") {
      if (!dgNote.trim()) return setError(`Say what happened — ${sponsor} reads it, and BTG if it comes to them.`);
      const bad = linkProblem(link);
      if (bad) return setError(bad);
    }
    setDialog("send");
  };

  const send = () => {
    const a = answer();
    if (!a) return;
    start(async () => {
      setError(null);
      const r = await answerProblemAction(lineId, a);
      if (!r.ok) {
        setDialog(null);
        return setError(r.message);
      }
      setDialog(null);
      router.refresh();
    });
  };

  const upload = async (f: File) => {
    setError(null);
    const bad = proofProblem({ type: f.type, size: f.size });
    if (bad) return setError(bad);
    setUploading(true);
    try {
      const g = await requestProofUploadAction(lineId, { contentType: f.type, bytes: f.size });
      if (!g.ok) return setError(g.message);
      let put: Response;
      try {
        put = await fetch(g.uploadUrl, { method: "PUT", headers: { "Content-Type": g.contentType }, body: f });
      } catch {
        return setError("The photo didn’t reach storage. Check your connection and try again — or send your answer without it.");
      }
      if (!put.ok) return setError("Storage refused the photo. Try again, or send your answer without it.");
      setPhoto({ key: g.key, name: f.name });
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };

  const choose = (p: Choice) => {
    setError(null);
    setPick(p);
    if (p === "rf") setDialog("refund");
  };

  const card = (p: Choice) =>
    `flex flex-col gap-2 rounded-lg p-3.5 ${pick === p ? "border-2 border-primary-soft bg-primary/8" : "border border-line bg-bg"}`;
  const field = "w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";
  const quote = (() => {
    const a = answer();
    if (!a) return "";
    if (a.answer === "DELIVER_AGAIN") return answerQuote({ answer: a.answer, note: a.note, newDate: a.newDate }, refundCents, sponsor);
    if (a.answer === "REFUND") return answerQuote({ answer: a.answer, note: null, newDate: null }, refundCents, sponsor);
    return answerQuote({ answer: a.answer, note: a.note, newDate: null, proof: { photo: Boolean(photo), link: link.trim() || null } }, refundCents, sponsor);
  })();

  return (
    <section aria-label="Delivery problem" className="flex flex-col gap-3 rounded-xl border border-danger/45 bg-surface p-4 sm:p-5">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-danger">{sponsor} reported a problem · {stamp(problem.at)}</p>
      {problem.text && <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-sm leading-relaxed">“{problem.text}”</p>}
      <DeadlineChip d={deadline("Answer by", sellerDueAt, clock, "danger")} after="If you don’t, BTG will decide." />
      <p className="text-[13px] font-semibold">How do you want to answer?</p>

      <div className="grid gap-2.5 md:grid-cols-3">
        <div className={card("re")}>
          <p className="text-sm font-semibold">Deliver again</p>
          <p className="text-xs leading-relaxed text-muted">Pick a new date and deliver it again. {sponsor} confirms within {CONFIRM_HOURS} hours of it being marked, as usual.</p>
          <button type="button" className={`${btn.quiet} mt-auto`} aria-pressed={pick === "re"} onClick={() => choose("re")}>Deliver again</button>
        </div>
        <div className={card("rf")}>
          <p className="text-sm font-semibold">Refund this line</p>
          <p className="text-xs leading-relaxed text-muted">Refund the whole line: {money(refundCents)} back to {sponsor}.</p>
          <button type="button" className={`${btn.quiet} mt-auto`} aria-pressed={pick === "rf"} onClick={() => choose("rf")}>Refund this line</button>
        </div>
        <div className={card("dg")}>
          <p className="text-sm font-semibold">Disagree</p>
          <p className="text-xs leading-relaxed text-muted">Say what happened, with a photo or link if you have one. It goes to BTG if {sponsor} doesn’t accept it.</p>
          <button type="button" className={`${btn.quiet} mt-auto`} aria-pressed={pick === "dg"} onClick={() => choose("dg")}>Disagree</button>
        </div>
      </div>

      {pick === "re" && (
        <form aria-label="Deliver again" className="flex flex-col gap-2.5 rounded-lg border border-line bg-bg p-3.5" onSubmit={(e) => { e.preventDefault(); review(); }}>
          <label className="flex flex-col gap-1.5 text-xs font-medium sm:max-w-[16rem]">
            New date
            <input type="date" required min={today} max={latest} value={newDate} onChange={(e) => setNewDate(e.target.value)} className={field} />
          </label>
          <label htmlFor="re-note" className="text-xs font-medium">Note to {sponsor} <span className="text-warn">(required)</span></label>
          <textarea id="re-note" rows={2} required maxLength={2000} value={reNote} onChange={(e) => setReNote(e.target.value)}
            placeholder="e.g. We’ll run it again at the same time" className={`${field} -mt-1 resize-y`} />
          <button type="submit" className={`${btn.primary} self-start`}>Send answer</button>
        </form>
      )}

      {pick === "dg" && (
        <form aria-label="Disagree" className="flex flex-col gap-2.5 rounded-lg border border-line bg-bg p-3.5" onSubmit={(e) => { e.preventDefault(); review(); }}>
          <label htmlFor="dg-note" className="text-xs font-medium">What happened <span className="text-warn">(required)</span></label>
          <textarea id="dg-note" rows={3} required maxLength={2000} value={dgNote} onChange={(e) => setDgNote(e.target.value)}
            placeholder="e.g. Both sessions were held — 18 kids came on the second day" className={`${field} -mt-1 resize-y`} />
          <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-xs">
            <span className="min-w-0 flex-1">
              {photo ? photo.name : "A photo"} <span className="text-muted">· photo · optional</span>
            </span>
            {photo && <span role="status" className="rounded-full bg-accent/12 px-2 text-[10px] font-semibold text-accent">✓ Added</span>}
            <input ref={file} type="file" accept="image/jpeg,image/png,application/pdf" className="sr-only" aria-label="Choose a photo"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
            <button type="button" className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold hover:bg-surface-2 disabled:opacity-40" disabled={uploading || pending} onClick={() => file.current?.click()}>
              {uploading ? "Uploading…" : photo ? "Change photo" : "Choose photo"}
            </button>
            <button type="button" className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold hover:bg-surface-2" aria-expanded={showLink} onClick={() => setShowLink(true)}>
              Add a link
            </button>
          </div>
          {showLink && (
            <label className="flex flex-col gap-1.5 text-xs font-medium">
              Link (https)
              <input type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" className={field} />
            </label>
          )}
          <button type="submit" className={`${btn.primary} self-start`} disabled={uploading}>Send answer</button>
        </form>
      )}

      {error && !dialog && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}

      {dialog === "refund" && (
        <OrderDialog id="rf" title="Refund this line?" onClose={() => { setDialog(null); setPick(null); }} onSubmit={send}>
          <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
            <li>Refund this line: {money(refundCents)} back to {sponsor}.</li>
            <li>Your share for this line goes to $0.00.</li>
            <li>{sponsor} is asked to accept the refund by {sponsorBy}.</li>
          </ul>
          <DialogError message={error} />
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus className={btn.quiet} onClick={() => { setDialog(null); setPick(null); }}>Cancel</button>
            <button type="submit" className={btn.danger} disabled={pending}>{pending ? "Sending…" : `Refund ${money(refundCents)}`}</button>
          </div>
        </OrderDialog>
      )}

      {dialog === "send" && (
        <OrderDialog id="sd" title={`Send your answer to ${sponsor}?`} onClose={() => setDialog(null)} onSubmit={send}>
          <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-[13px] leading-relaxed">{quote}</p>
          <p className="text-xs leading-relaxed text-muted">{sponsor} has until {sponsorBy} to accept or reject it. If they reject it, BTG decides.</p>
          <DialogError message={error} />
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus className={btn.quiet} onClick={() => setDialog(null)}>Cancel</button>
            <button type="submit" className={btn.primary} disabled={pending}>{pending ? "Sending…" : "Send answer"}</button>
          </div>
        </OrderDialog>
      )}
    </section>
  );
}
