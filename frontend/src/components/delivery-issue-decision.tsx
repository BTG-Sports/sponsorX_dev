"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { proofLinkAction, remindSellerAction, resolveIssueAction } from "@/app/(app)/admin/delivery-issues/actions";
import { money, possessive, type ApiDeliveryIssue } from "@/lib/delivery-issues-live";
import { useDialogFocus } from "./use-dialog-focus";

/* --------------------------------------------------------------------------
   BTG's decision on a reported delivery problem — 2S4-FE-04 (design
   DeliveryIssues.dc.html, views detail / confirm / refund). Live
   (2S4-BE-07): "Confirm delivered" and "Cancel and refund" post through
   resolveIssueAction (POST /delivery-issues/:lineId/resolve) with the
   required note, which the API emails to the sponsor and the seller.

   Also here: "View proof" (a 5-minute audited link, opened in a new tab)
   and the overdue list's "Remind seller".
   -------------------------------------------------------------------------- */

export function DeliveryIssueDecision({ problem }: { problem: ApiDeliveryIssue }) {
  const [open, setOpen] = useState<null | "confirm" | "refund">(null);
  const team = problem.seller.sub;
  const decided = problem.state !== "PROBLEM";
  return (
    <>
      <aside aria-label="Decision" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs text-muted">{decided ? "Decided" : "Your decision"}</p>
        {decided ? (
          <p className="text-[13px] leading-relaxed">
            {problem.state === "CONFIRMED" ? "This line was confirmed as delivered." : problem.state === "REFUNDED" ? "This line was cancelled and refunded." : `This line is ${problem.state.toLowerCase().replace("_", " ")}.`}
          </p>
        ) : (
          <>
            <button type="button" onClick={() => setOpen("confirm")}
              className="min-h-12 rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
              Confirm delivered
            </button>
            <button type="button" onClick={() => setOpen("refund")}
              className="min-h-11 rounded-lg border border-danger/50 px-4 text-[13px] font-semibold text-danger hover:bg-danger/10">
              Cancel and refund this line
            </button>
            <p className="text-xs leading-relaxed text-muted">
              Both choices email {problem.sponsor.name}, {problem.seller.name}{team ? ` and ${team}` : ""}. Talk to both sides first if you need more.
            </p>
          </>
        )}
      </aside>

      {open === "confirm" && (
        <Decision
          id="dc" lineId={problem.id} decision="CONFIRM" title={`Confirm ${problem.orderRef} was delivered?`} onClose={() => setOpen(null)}
          cancel="Cancel" go="Confirm delivered" primary
          points={[
            "The line counts as delivered.",
            `The hold ends: ${possessive(problem.seller.name)} ${money(problem.hold.sellerShareCents)}${team ? ` and ${possessive(team)} ${money(problem.hold.teamShareCents)}` : ""} can be paid out.`,
            `${problem.sponsor.name} is told, with your note.`,
          ]}
        />
      )}
      {open === "refund" && (
        <Decision
          id="rf" lineId={problem.id} decision="REFUND" title="Cancel and refund this line?" onClose={() => setOpen(null)}
          cancel="Keep the line" go="Cancel and refund"
          points={[
            `The ${money(problem.hold.sponsorPaidCents)} ${problem.sponsor.name} paid for this line is refunded in the books. SponsorX doesn't move the money itself yet — return it through the payment provider.`,
            `${possessive(problem.seller.name)} ${money(problem.hold.sellerShareCents)}${team ? ` and ${possessive(team)} ${money(problem.hold.teamShareCents)}` : ""} are cancelled.`,
            "Everyone is emailed your note.",
          ]}
        />
      )}
    </>
  );
}

function Decision({ id, lineId, decision, title, points, cancel, go, primary, onClose }: {
  id: string; lineId: string; decision: "CONFIRM" | "REFUND"; title: string; points: string[]; cancel: string; go: string; primary?: boolean; onClose: () => void;
}) {
  const ref = useDialogFocus<HTMLDivElement>(onClose);
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => {
    setError(null);
    if (!note.trim()) return setError("Add a note — the sponsor and the seller both read it.");
    start(async () => {
      const r = await resolveIssueAction(lineId, decision, note);
      if (!r.ok) return setError(r.message);
      onClose();
      router.refresh();
    });
  };
  return (
    <div ref={ref} className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="sx-backdrop absolute inset-0 cursor-default bg-black/70" />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-4 pt-24 sm:pt-36">
        <form
          className="sx-pop relative flex w-full max-w-md flex-col gap-3.5 rounded-2xl border border-primary/40 bg-surface p-6 shadow-2xl"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
          <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed">
            {points.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <label htmlFor={`${id}-note`} className="text-[13px] font-semibold">Note to everyone <span className="font-medium text-warn">(required)</span></label>
          <textarea id={`${id}-note`} rows={3} required maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)}
            className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2.5 text-[13px] leading-normal outline-none focus:border-primary" />
          {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" data-autofocus onClick={onClose} className="min-h-11 rounded-lg border border-line px-4 text-[13px] font-medium text-text hover:bg-surface-2">{cancel}</button>
            <button type="submit" disabled={pending}
              className={`min-h-11 rounded-lg px-4 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-danger/50 text-danger hover:bg-danger/10"}`}>
              {pending ? "Saving…" : go}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** "View proof" — a five-minute, audited link to the seller's photo, in a new tab. */
export function DeliveryProofButton({ lineId, count }: { lineId: string; count: number }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = () =>
    start(async () => {
      setError(null);
      const r = await proofLinkAction(lineId);
      if (!r.ok) return setError(r.message);
      window.open(r.url, "_blank", "noopener,noreferrer");
    });
  return (
    <span className="mt-2 flex flex-col items-start gap-1">
      <button type="button" onClick={open} disabled={pending}
        className="min-h-9 rounded-lg border border-line px-3.5 text-xs font-semibold text-text hover:bg-surface-2 disabled:opacity-40">
        {pending ? "Opening…" : `View proof · ${count} photo${count === 1 ? "" : "s"}`}
      </button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}

/** The overdue list's "Remind seller" — emails the seller and the team's manager; at most once a day. */
export function RemindSellerButton({ lineId, seller }: { lineId: string; seller: string }) {
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
        className="min-h-9 rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40">
        {pending ? "Sending…" : state === "sent" ? "Reminder sent" : "Remind seller"}
      </button>
      {state && state !== "sent" && <span role="alert" className="text-[11px] text-danger">{state}</span>}
    </span>
  );
}
