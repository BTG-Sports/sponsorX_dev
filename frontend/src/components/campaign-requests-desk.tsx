"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  dayWords,
  declineNoteProblem,
  decisionWords,
  proposalLines,
  requestKindWords,
  requestWaiting,
  requesterWords,
  type ApiCampaignRequest,
} from "@/lib/campaign-change-live";
import { CampaignDialog, ImpactView, dialogBtn, fieldCls } from "./campaign-impact";

/* --------------------------------------------------------------------------
   P8-FE-12 — BTG's Campaign requests queue: every held cancel or change as a
   card with who asked, why, what changes, the same impact view the requester
   saw, and Approve / Decline. Decline opens a dialog for the note the
   requester is emailed. Decided rows stay, greyed, with the decision.
   -------------------------------------------------------------------------- */

type Fail = { ok: false; message: string; unavailable?: boolean };
type DecisionResult = { ok: true } | Fail;
type Decide = (requestId: string, decision: "APPROVE" | "DECLINE", note?: string) => Promise<DecisionResult>;

export function CampaignRequestsDesk({ rows, decide, now }: { rows: ApiCampaignRequest[]; decide: Decide; now: number }) {
  return (
    <ul className="space-y-3" aria-label="Campaign requests">
      {rows.map((r) => (
        <RequestCard key={r.id} r={r} decide={decide} now={now} />
      ))}
    </ul>
  );
}

function ago(iso: string | undefined, now: number): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const days = Math.floor((now - t) / 86_400_000);
  if (days <= 0) return `today · ${dayWords(iso)}`;
  if (days === 1) return `yesterday · ${dayWords(iso)}`;
  return `${days} days ago · ${dayWords(iso)}`;
}

function RequestCard({ r, decide, now }: { r: ApiCampaignRequest; decide: Decide; now: number }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const waiting = requestWaiting(r) && !done;
  const decided = done ?? decisionWords(r);
  const who = requesterWords(r);
  const when = ago(r.requestedAt, now);
  const lines = proposalLines(r.proposed);
  const cancel = r.kind === "CANCEL";

  const approve = () => {
    setError(null);
    start(async () => {
      const res = await decide(r.id, "APPROVE");
      if (!res.ok) return setError(res.message);
      setDone(cancel ? "Approved — the campaign is cancelled." : "Approved — the changes are applied.");
      router.refresh();
    });
  };

  return (
    <li className={`sx-card rounded-xl border border-line bg-surface p-4 ${waiting ? "" : "opacity-75"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cancel ? "border-danger/40 text-danger" : "border-primary/40 text-primary"}`}>
              {requestKindWords(r.kind)}
            </span>
            <Link href={`/admin/campaigns/${encodeURIComponent(r.campaign.id)}?from=campaign-requests`} className="min-w-0 text-sm font-semibold tracking-tight hover:underline [overflow-wrap:anywhere]">
              {r.campaign.name}
            </Link>
            {r.campaign.sponsorName && <span className="text-xs text-muted">· {r.campaign.sponsorName}</span>}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {[who, when].filter(Boolean).join(" · ") || "Held for BTG"}
          </p>
        </div>
        {waiting ? (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setDeclining(true)} disabled={pending} className={dialogBtn.quiet}>
              Decline
            </button>
            <button type="button" onClick={approve} disabled={pending} className={dialogBtn.primary}>
              {pending ? "Applying…" : "Approve"}
            </button>
          </div>
        ) : (
          decided && <p role="status" className="text-xs font-medium text-accent">{decided}</p>
        )}
      </div>

      {r.reason?.trim() && <p className="mt-3 text-[13px] leading-relaxed [overflow-wrap:anywhere]">&ldquo;{r.reason.trim()}&rdquo;</p>}

      {lines.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-[13px]" aria-label="What changes">
          {lines.map((l) => (
            <li key={l} className="[overflow-wrap:anywhere]">{l}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-line-soft pt-3">
        {r.impact ? (
          <ImpactView impact={{ ...r.impact, holdReasons: r.impact.holdReasons?.length ? r.impact.holdReasons : (r.holdReasons ?? []), automatic: false }} compact />
        ) : r.holdReasons?.length ? (
          <p className="text-[12px] text-muted">Held because: {r.holdReasons.join("; ")}</p>
        ) : (
          <p className="text-[12px] text-muted">The impact wasn&rsquo;t sent with this request.</p>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}

      {declining && (
        <DeclineDialog
          r={r}
          onClose={() => setDeclining(false)}
          submit={async (note) => {
            const res = await decide(r.id, "DECLINE", note);
            if (!res.ok) return res.message;
            setDeclining(false);
            setDone(`Declined — “${note}”`);
            router.refresh();
            return null;
          }}
        />
      )}
    </li>
  );
}

function DeclineDialog({ r, onClose, submit }: { r: ApiCampaignRequest; onClose: () => void; submit: (note: string) => Promise<string | null> }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const problem = declineNoteProblem(note);
  const id = `cr-decline-${r.id}`;
  const send = () => {
    setError(null);
    if (problem) return setError(problem);
    start(async () => {
      const message = await submit(note.trim());
      if (message) setError(message);
    });
  };
  return (
    <CampaignDialog id={id} title={`Decline — ${requestKindWords(r.kind).toLowerCase()} ${r.campaign.name}?`} onClose={onClose} onSubmit={send}>
      <p className="text-[13px] leading-relaxed text-muted">
        The campaign stays as it is. The requester is emailed your note.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-[13px] font-semibold">
          Note <span className="font-medium text-warn">(required)</span>
        </label>
        <textarea id={`${id}-note`} data-autofocus rows={3} required maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className={`${fieldCls} resize-y`} />
      </div>
      {error && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-[11px] text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2.5">
        <button type="button" className={dialogBtn.quiet} onClick={onClose}>Cancel</button>
        <button type="submit" disabled={pending || problem !== null} className={dialogBtn.danger}>
          {pending ? "Sending…" : "Decline"}
        </button>
      </div>
      {problem && !error && <p className="text-[11px] text-muted">Write a note to turn on &ldquo;Decline&rdquo;.</p>}
    </CampaignDialog>
  );
}
