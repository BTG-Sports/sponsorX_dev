"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { btgListingAction, decideListingAction } from "@/app/(app)/admin/marketplace/actions";
import { Badge } from "@/components/ui";
import {
  agoLabel, BTG_ACTION_COPY, btgListingActions, isOverdue, needsReason, publishedByLabel, sellerLabel, usd, waitLabel,
  type ApiListing, type BtgListingAction, type ListingDecision,
} from "@/lib/marketplace-ops-live";

/* --------------------------------------------------------------------------
   2S7-FE-02 / 2S3-FE-04 — BTG's listing desks on the marketplace console.

   Listings go live on their own when their checks pass (2S3-BE-06); BTG
   handles the exceptions:

     MopsListingQueue        the listings held for BTG, each with the
                             reasons it was held (`reviewReasons`, in full —
                             only BTG reads them), decided inline: Approve
                             (offered only when the API reports no
                             governance blockers — it would refuse with 422),
                             Request changes or Reject (both need a note,
                             which the seller is emailed)
     MopsAutoPublishedList   the listings published automatically, newest
                             first, with Pause / End and a required reason
                             the seller is emailed (and Put back live for a
                             listing BTG paused)

   `now` comes from the server render so the wait labels match it.
   -------------------------------------------------------------------------- */

const primaryBtn =
  "rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40";
const secondaryBtn = "rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2 disabled:opacity-40";
const noteBox =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-faint focus:border-primary/60 focus:outline-none";

function ItemLine({ l, extra }: { l: ApiListing; extra?: ReactNode }) {
  return (
    <p className="text-[11px] text-muted">
      {usd(l.item.priceCents)} · {l.item.kind.toLowerCase().replace(/_/g, " ")}
      {l.item.quantity !== null ? ` · ${l.item.quantity} in stock` : ""} · {l.visibility === "PRIVATE" ? "private" : "public"}
      {extra}
    </p>
  );
}

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
  const [open, setOpen] = useState<"REQUEST_CHANGES" | "REJECT" | null>(null);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const wait = waitLabel(l.submittedAt, now);
  const late = isOverdue(l.submittedAt, now);
  const blocked = l.blockers.length > 0;
  const reasons = l.reviewReasons ?? [];

  const decide = (decision: ListingDecision) => {
    setMessage(null);
    start(async () => {
      const r = await decideListingAction(l.id, decision, notes);
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setDone(decision === "APPROVE" ? "Approved — live" : decision === "REJECT" ? "Rejected — ended" : "Changes requested");
      router.refresh();
    });
  };

  return (
    <li id={`listing-${l.id}`} className="space-y-2 px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {l.title} <span className="font-normal text-muted">· {sellerLabel(l)}</span>
          </p>
          <ItemLine
            l={l}
            extra={
              wait ? (
                <span className={late ? "text-warn" : ""}>
                  {" "}
                  · waiting {wait}
                </span>
              ) : null
            }
          />
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
              className={primaryBtn}
            >
              Approve
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen((v) => (v === "REQUEST_CHANGES" ? null : "REQUEST_CHANGES"))} className={secondaryBtn}>
              Request changes
            </button>
            <button type="button" disabled={pending} onClick={() => setOpen((v) => (v === "REJECT" ? null : "REJECT"))} className={`${secondaryBtn} text-danger`}>
              Reject
            </button>
          </div>
        )}
      </div>
      {reasons.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-[11px] text-warn">
          <p className="font-semibold">Held because</p>
          <ul>
            {reasons.map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </div>
      )}
      {blocked && (
        <ul className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-[11px] text-danger">
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
            placeholder={open === "REJECT" ? "Why it's rejected — the seller is emailed this" : "What needs to change, and why — the seller is emailed this"}
            className={noteBox}
          />
          <button type="button" disabled={pending || !notes.trim()} onClick={() => decide(open)} className={primaryBtn}>
            {pending ? "Sending…" : open === "REJECT" ? "Reject and end it" : "Send back for changes"}
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

export function MopsAutoPublishedList({ listings, now }: { listings: ApiListing[]; now: number }) {
  return (
    <ul className="divide-y divide-line-soft">
      {listings.map((l) => (
        <AutoRow key={l.id} listing={l} now={now} />
      ))}
    </ul>
  );
}

const STATE_BADGE: Record<ApiListing["state"], { label: string; tone: "accent" | "neutral" | "warn" | "primary" }> = {
  PUBLISHED: { label: "Live", tone: "accent" },
  PAUSED: { label: "Paused", tone: "primary" },
  ARCHIVED: { label: "Ended", tone: "neutral" },
  PENDING_APPROVAL: { label: "Held", tone: "warn" },
  DRAFT: { label: "Draft", tone: "neutral" },
};

function AutoRow({ listing: l, now }: { listing: ApiListing; now: number }) {
  const router = useRouter();
  const [open, setOpen] = useState<BtgListingAction | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const actions = btgListingActions({ state: l.state, btgAction: l.btgAction ?? null });
  const badge = STATE_BADGE[l.state];
  const future = l.publishedAt && Date.parse(l.publishedAt) > now;

  const act = (action: BtgListingAction) => {
    setMessage(null);
    start(async () => {
      const r = await btgListingAction(l.id, { state: l.state, btgAction: l.btgAction ?? null }, action, reason);
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      setDone(BTG_ACTION_COPY[action].done);
      setOpen(null);
      router.refresh();
    });
  };

  return (
    <li id={`listing-${l.id}`} className="space-y-2 px-5 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {l.title} <span className="font-normal text-muted">· {sellerLabel(l)}</span>
          </p>
          <ItemLine
            l={l}
            extra={<> · {publishedByLabel(l) ?? "Published"} {future ? `— goes live ${l.publishedAt!.slice(0, 10)}` : agoLabel(l.publishedAt ?? null, now)}</>}
          />
          {l.btgAction && l.btgReason && (
            <p className="mt-0.5 text-[11px] text-danger">
              {l.btgAction === "ENDED" ? "Ended by BTG" : "Paused by BTG"}: {l.btgReason}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={badge.tone}>{done ?? badge.label}</Badge>
          {!done &&
            actions.map((a) =>
              needsReason(a) ? (
                <button key={a} type="button" disabled={pending} onClick={() => setOpen((v) => (v === a ? null : a))} className={a === "END" ? `${secondaryBtn} text-danger` : secondaryBtn}>
                  {BTG_ACTION_COPY[a].label}
                </button>
              ) : (
                <button key={a} type="button" disabled={pending} onClick={() => act(a)} className={primaryBtn}>
                  {BTG_ACTION_COPY[a].label}
                </button>
              ),
            )}
        </div>
      </div>
      {open && !done && (
        <div className="space-y-2">
          <textarea rows={2} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} placeholder={BTG_ACTION_COPY[open].placeholder} className={noteBox} />
          <button type="button" disabled={pending || !reason.trim()} onClick={() => act(open)} className={primaryBtn}>
            {pending ? "Sending…" : open === "END" ? "End it and email the seller" : "Pause it and email the seller"}
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
