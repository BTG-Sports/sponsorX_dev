"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { proofLinkAction, remindSellerAction, resolveIssueAction } from "@/app/(app)/admin/delivery-issues/actions";
import { money, possessive, type ApiDeliveryIssue } from "@/lib/delivery-issues-live";
import { decisionLead, settledWords, type Settlement } from "@/lib/order-automation-live";
import { DialogError, NoteField, OrderDialog, btn } from "./order-dialog";

/* --------------------------------------------------------------------------
   BTG's decision on a delivery problem — 2S4-FE-04 / 2S4-FE-05 (design
   OrderExceptions.dc.html, views timeline / decideConfirm / decideRefund;
   earlier DeliveryIssues.dc.html). Since 2S4-BE-11 BTG decides only what
   the seller and the sponsor couldn't settle (`canDecide`: the issue is
   ESCALATED). "Confirm delivered" and "Refund this line" post through
   resolveIssueAction (POST /delivery-issues/:lineId/resolve) with the
   required note, which the API emails to both sides.

   Also here: "View photo" (a 5-minute audited link, opened in a new tab —
   the line's own, or a problem's answer / disputed photo) and the overdue
   list's "Remind seller".
   -------------------------------------------------------------------------- */

export function DeliveryIssueDecision({ problem }: { problem: ApiDeliveryIssue & { settlement?: Settlement } }) {
  const [open, setOpen] = useState<null | "confirm" | "refund">(null);
  const team = problem.seller.sub;
  const canDecide = problem.canDecide ?? problem.state === "PROBLEM";
  const between = problem.issue && (problem.issue.stage === "SELLER_TO_ANSWER" || problem.issue.stage === "SPONSOR_TO_ANSWER");
  const shares = `${possessive(problem.seller.name)} ${money(problem.hold.sellerShareCents)}${team ? ` and ${possessive(team)} ${money(problem.hold.teamShareCents)}` : ""}`;
  return (
    <>
      <aside aria-label="Decision" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        {canDecide ? (
          <>
            <p className="text-xs text-muted">{decisionLead(problem)}</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-1.5 text-xs tabular-nums">
              <dt className="text-muted">{possessive(problem.seller.name)} share on hold</dt><dd>{money(problem.hold.sellerShareCents)}</dd>
              {team && (<><dt className="text-muted">{possessive(team)} share on hold</dt><dd>{money(problem.hold.teamShareCents)}</dd></>)}
              <dt className="text-muted">{problem.sponsor.name} paid for this line</dt><dd>{money(problem.hold.sponsorPaidCents)}</dd>
            </dl>
            <button type="button" onClick={() => setOpen("confirm")}
              className="min-h-12 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
              Confirm delivered
            </button>
            <button type="button" onClick={() => setOpen("refund")}
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10">
              Refund this line
            </button>
            <p className="text-[11px] text-faint">Your note goes to both sides.</p>
          </>
        ) : (
          <>
            <p className="text-xs text-muted">{problem.settlement || problem.issue?.stage === "SETTLED" ? "Settled between them" : between ? "Still between them" : "Decided"}</p>
            <p className="text-[13px] leading-relaxed">
              {problem.settlement || problem.issue?.stage === "SETTLED"
                ? settledWords(problem.settlement?.outcome ?? problem.issue?.outcome?.outcome, problem.redeliverOn)
                : between
                ? "The seller and the sponsor are still settling this between them — it comes to you only if they can’t."
                : problem.state === "CONFIRMED" ? "This line was confirmed as delivered."
                : problem.state === "REFUNDED" ? "This line was cancelled and refunded."
                : `This line is ${problem.state.toLowerCase().replace("_", " ")}.`}
            </p>
          </>
        )}
      </aside>

      {open === "confirm" && (
        <Decision
          id="dd" lineId={problem.id} decision="CONFIRM" title="Confirm delivered?" onClose={() => setOpen(null)}
          go="Confirm delivered" primary
          points={[
            "The line counts as delivered. Nothing is refunded.",
            `The hold ends: ${shares} can be paid out.`,
            `${problem.sponsor.name} and ${problem.seller.name} both get your note.`,
          ]}
        />
      )}
      {open === "refund" && (
        <Decision
          id="dd" lineId={problem.id} decision="REFUND" title="Refund this line?" onClose={() => setOpen(null)}
          go={`Refund ${money(problem.hold.sponsorPaidCents)}`}
          points={[
            `${problem.sponsor.name} gets the ${money(problem.hold.sponsorPaidCents)} paid for this line back in the books. SponsorX doesn’t move the money itself yet — return it through the payment provider.`,
            `${possessive(problem.seller.name)}${team ? ` and ${possessive(team)}` : ""} share${team ? "s" : ""} for this line go${team ? "" : "es"} to $0.00. Any other lines on the order are paid as usual.`,
            `${problem.sponsor.name} and ${problem.seller.name} both get your note.`,
          ]}
        />
      )}
    </>
  );
}

function Decision({ id, lineId, decision, title, points, go, primary, onClose }: {
  id: string; lineId: string; decision: "CONFIRM" | "REFUND"; title: string; points: string[]; go: string; primary?: boolean; onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const off = !note.trim();
  const submit = () => {
    setError(null);
    if (off) return setError("Add a note — the sponsor and the seller both read it.");
    start(async () => {
      const r = await resolveIssueAction(lineId, decision, note);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <OrderDialog id={id} title={title} onClose={onClose} onSubmit={submit}>
      <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-text/85">
        {points.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <NoteField id={`${id}-note`} label="Note to both sides" value={note} onChange={setNote} />
      <DialogError message={error} />
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={btn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={off || pending} className={primary ? btn.primary : btn.danger}>{pending ? "Saving…" : go}</button>
      </div>
      {off && <p className="text-[11px] text-muted">Write a note to turn on “{go}”.</p>}
    </OrderDialog>
  );
}

/** "View proof" — a five-minute, audited link to the seller's photo, in a new tab. */
export function DeliveryProofButton({ lineId, count, issue, photo, label }: {
  lineId: string; count: number; issue?: string | null; photo?: "answer" | "marked" | "current"; label?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = () =>
    start(async () => {
      setError(null);
      const r = await proofLinkAction(lineId, { issue, photo });
      if (!r.ok) return setError(r.message);
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
  return (
    <span className="mt-2 flex flex-col items-start gap-1">
      <button type="button" onClick={open} disabled={pending}
        className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2 disabled:opacity-40">
        {pending ? "Opening…" : label ?? `View proof · ${count} photo${count === 1 ? "" : "s"}`}
      </button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

/** The overdue list's "Remind seller" — emails the seller and the team's manager; at most once a day. */
export function RemindSellerButton({ lineId, seller, label = "Remind seller" }: { lineId: string; seller: string; label?: string }) {
  const router = useRouter();
  const [state, setState] = useState<null | "sent" | string>(null);
  const [pending, start] = useTransition();
  const remind = () =>
    start(async () => {
      const r = await remindSellerAction(lineId);
      setState(r.ok ? "sent" : r.message);
      if (r.ok) router.refresh();
    });
  return (
    <span className="inline-flex flex-col items-start gap-1 md:items-end">
      <button type="button" onClick={remind} disabled={pending || state === "sent"} aria-label={`Remind ${seller}`}
        className="min-h-11 w-full rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40 md:min-h-9 md:w-auto">
        {pending ? "Sending…" : state === "sent" ? "Reminder sent" : label}
      </button>
      {state && state !== "sent" && <span role="alert" className="text-[11px] text-danger">{state}</span>}
    </span>
  );
}
