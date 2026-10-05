"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge, Button, Card } from "./ui";
import { bookCampaignAction, addSlotAction } from "@/app/(app)/admin/next/actions";
import { money } from "@/lib/fixtures";
import { rateCardPrice, slotPriceHint, type ApiRateCard, type ApiSaleCandidate, type ApiSlotKind } from "@/lib/editions-live";

/* --------------------------------------------------------------------------
   P9-FE-03 / -04 — the two live inventory writes.

   BookCampaign: a campaign's package promises positions; booking sells them
   all or none. The list is GET /editions/:id/sale-candidates, so a package
   that needs the sold back cover is shown as unavailable and has no button —
   the UI cannot put a second campaign on it. The ledger refuses it anyway
   (Postgres, P9-BE-03); this is the menu, not the rule.

   AddSlot: the editorial meeting laying out a position.
   -------------------------------------------------------------------------- */

const KIND_LABEL: Record<ApiSlotKind, string> = {
  FULL: "full page",
  HALF: "half page",
  QUARTER: "quarter",
  BACK_COVER: "back cover",
  PRESENTING: "presenting",
};

function positions(kinds: ApiSlotKind[]): string {
  const n = kinds.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});
  return Object.entries(n)
    .map(([k, c]) => `${c > 1 ? `${c} × ` : ""}${KIND_LABEL[k as ApiSlotKind]}`)
    .join(" + ");
}

export function BookCampaign({
  editionId,
  candidates,
  selling,
}: {
  editionId: string;
  candidates: ApiSaleCandidate[];
  /** The edition is SELLING and before its close date. */
  selling: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  const book = (campaignId: string) => {
    setBusy(campaignId);
    setNote(null);
    start(async () => {
      const r = await bookCampaignAction(editionId, campaignId);
      setNote(r);
      setBusy(null);
      if (r.ok) router.refresh();
    });
  };

  return (
    <Card className="p-0">
      <p className="border-b border-line-soft px-4 py-2.5 text-[10px] font-medium uppercase tracking-wide text-faint">
        Book a campaign
      </p>
      {!selling ? (
        <p className="px-4 py-4 text-[11px] text-muted">This edition is not selling — positions book only while it is SELLING and before close.</p>
      ) : candidates.length === 0 ? (
        <p className="px-4 py-4 text-[11px] text-muted">
          No draft campaign has a NEXT package waiting. A sponsor&rsquo;s brief on a package with ad positions appears here once its campaign is drafted.
        </p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {candidates.map((c) => {
            const blocked = c.holdsPlacements || c.unavailable.length > 0;
            return (
              <li key={c.campaignId} className="px-4 py-3 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.sponsor}</p>
                    <p className="truncate text-[11px] text-muted">{c.campaign} · {c.package.name}</p>
                  </div>
                  <span className="shrink-0 tabular-nums text-muted">{money(c.package.priceCents)}</span>
                </div>
                <p className="mt-1 text-[11px] text-faint">{positions(c.positions)}</p>
                {c.holdsPlacements ? (
                  <Badge tone="neutral">already booked in this edition</Badge>
                ) : c.unavailable.length > 0 ? (
                  <p className="mt-1.5 text-[11px] text-warn">
                    No {c.unavailable.map((k) => KIND_LABEL[k]).join(" or ")} left — this package can&rsquo;t be honoured here.
                  </p>
                ) : null}
                {!blocked && (
                  <div className="mt-2">
                    <Button onClick={() => book(c.campaignId)} disabled={pending}>
                      {busy === c.campaignId ? "Booking…" : "Book positions"}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {note && (
        <p role="status" className={`border-t border-line-soft px-4 py-2.5 text-[11px] ${note.ok ? "text-success" : "text-danger"}`}>
          {note.message}
        </p>
      )}
    </Card>
  );
}

const ADD_KINDS: ApiSlotKind[] = ["FULL", "HALF", "QUARTER", "BACK_COVER", "PRESENTING"];

export function AddSlot({
  editionId,
  disabledReason,
  rateCard,
}: {
  editionId: string;
  disabledReason?: string;
  /** P9-BE-18 — the masthead's rate card: a kind it prices needs no typed price. */
  rateCard?: ApiRateCard | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<ApiSlotKind>("QUARTER");
  const [price, setPrice] = useState("");
  const carded = rateCardPrice(rateCard, kind);
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  if (disabledReason) {
    return (
      <Button disabled title={disabledReason}>
        Add a slot
      </Button>
    );
  }
  if (!open) return <Button onClick={() => setOpen(true)}>Add a slot</Button>;

  const submit = () =>
    start(async () => {
      const r = await addSlotAction(editionId, { slotCode: code, kind, priceDollars: price });
      setNote(r);
      if (r.ok) {
        setCode("");
        setPrice("");
        router.refresh();
      }
    });

  const field = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-admin";
  return (
    <form
      className="flex w-full flex-wrap items-end gap-2 rounded-xl border border-line bg-surface p-3 sm:w-auto"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        Code
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="P04-QTR-A" maxLength={40} className={`${field} w-28 normal-case`} required />
      </label>
      <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        Kind
        <select value={kind} onChange={(e) => setKind(e.target.value as ApiSlotKind)} className={`${field} normal-case`}>
          {ADD_KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[10px] font-medium uppercase tracking-wide text-muted">
        Rack $
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder={carded != null ? String(carded / 100) : ""}
          aria-describedby={`slot-price-hint-${editionId}`}
          className={`${field} w-20 tabular-nums`}
          required={carded == null}
        />
      </label>
      <button type="submit" disabled={pending} className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40">
        {pending ? "Adding…" : "Add"}
      </button>
      <button type="button" onClick={() => { setOpen(false); setNote(null); }} className="px-2 py-2 text-xs text-muted hover:text-text">
        Done
      </button>
      <p id={`slot-price-hint-${editionId}`} className="basis-full text-[11px] text-muted">{slotPriceHint(rateCard, kind)}</p>
      {note && (
        <p role="status" className={`basis-full text-[11px] ${note.ok ? "text-success" : "text-danger"}`}>
          {note.message}
        </p>
      )}
    </form>
  );
}
