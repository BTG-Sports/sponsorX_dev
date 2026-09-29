"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { decideListingAction } from "@/app/(app)/admin/marketplace/actions";
import { Badge } from "@/components/ui";
import { isOverdue, usd, waitLabel, type ApiListing, type ListingDecision } from "@/lib/marketplace-ops-live";

/* --------------------------------------------------------------------------
   2S7-FE-02 — listings awaiting BTG's approval, decided inline. Approve is
   offered only when the API reports no governance blockers (it would refuse
   with 422 otherwise); Request changes always needs a note, which the
   property reads. `now` comes from the server render so the wait labels
   match it.
   -------------------------------------------------------------------------- */

export function MopsListingQueue({ listings, now }: { listings: ApiListing[]; now: number }) {
  return (
    <ul className="divide-y divide-line-soft">
      {listings.map((l) => (
        <ListingRow key={l.id} listing={l} now={now} />
      ))}
    </ul>
  );
}

function ListingRow({ listing: l, now }: { listing: ApiListing; now: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const wait = waitLabel(l.submittedAt, now);
  const late = isOverdue(l.submittedAt, now);
  const blocked = l.blockers.length > 0;

  const decide = (decision: ListingDecision) => {
    setMessage(null);
    start(async () => {
      const r = await decideListingAction(l.id, decision, notes);
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setDone(decision === "APPROVE" ? "Approved — published" : "Changes requested");
      router.refresh();
    });
  };

  return (
    <li className="space-y-2 px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {l.title} <span className="font-normal text-muted">· {l.propertyName}</span>
          </p>
          <p className="text-[11px] text-muted">
            {usd(l.item.priceCents)} · {l.item.kind.toLowerCase().replace(/_/g, " ")}
            {l.item.quantity !== null ? ` · ${l.item.quantity} in stock` : ""} · {l.visibility === "PRIVATE" ? "private" : "public"}
            {wait ? (
              <span className={late ? "text-warn" : ""}>
                {" "}
                · waiting {wait}
              </span>
            ) : null}
          </p>
        </div>
        {done ? (
          <Badge tone="accent">{done}</Badge>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || blocked}
              title={blocked ? "Resolve the blockers first" : undefined}
              onClick={() => decide("APPROVE")}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setOpen((v) => !v)}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40"
            >
              Request changes
            </button>
          </div>
        )}
      </div>
      {blocked && (
        <ul className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] text-warn">
          {l.blockers.map((b) => (
            <li key={b}>• {b}</li>
          ))}
        </ul>
      )}
      {open && !done && (
        <div className="space-y-2">
          <textarea
            rows={2}
            value={notes}
            maxLength={4000}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What needs to change, and why — the property reads this"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none"
          />
          <button
            type="button"
            disabled={pending || !notes.trim()}
            onClick={() => decide("REQUEST_CHANGES")}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Sending…" : "Send back for changes"}
          </button>
        </div>
      )}
      {message && (
        <p role="alert" className="text-xs text-danger">
          {message}
        </p>
      )}
    </li>
  );
}
