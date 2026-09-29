"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";

import { addToCartAction } from "@/app/(app)/sponsor/shop/actions";
import { ShopRefusal } from "@/components/shop-bits";
import { defaultQuantity, defaultWindow, isoDay, validateLine, type ItemWindow } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-01 — a search result's "Add to cart": a small form for quantity and
   dates, kept inside the item's own availableFrom / availableUntil (the date
   inputs' min/max, and checked before sending). The server action opens the
   cart if needed and adds the line; the API's 409 reasons are listed in full.
   -------------------------------------------------------------------------- */

const input =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-text focus:border-primary/50 focus:outline-none";

export function ShopAddToCart({ listingId, item, today }: { listingId: string; item: ItemWindow; today: string }) {
  const start = defaultWindow(item, today);
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(defaultQuantity(item.packageRules ?? null)));
  const [startsOn, setStartsOn] = useState(start.startsOn);
  const [endsOn, setEndsOn] = useState(start.endsOn);
  const [refusal, setRefusal] = useState<{ message: string; reasons: string[] } | null>(null);
  const [added, setAdded] = useState(false);
  const [pending, begin] = useTransition();

  const min = item.availableFrom ? isoDay(item.availableFrom) : undefined;
  const max = item.availableUntil ? isoDay(item.availableUntil) : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(quantity);
    const problems = validateLine({ quantity: qty, startsOn, endsOn }, item);
    if (problems.length) {
      setRefusal({ message: "Check the line:", reasons: problems });
      return;
    }
    setRefusal(null);
    begin(async () => {
      const r = await addToCartAction(listingId, qty, startsOn, endsOn);
      if (r.ok) {
        setAdded(true);
        setOpen(false);
      } else setRefusal({ message: r.message, reasons: r.reasons });
    });
  };

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setAdded(false);
          }}
          className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft"
        >
          {added ? "Add again" : "Add to cart"}
        </button>
        {added && (
          <p role="status" className="text-xs text-accent">
            Added.{" "}
            <Link href="/sponsor/cart" className="font-medium underline">
              View cart →
            </Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-lg border border-line bg-surface-2 p-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="text-[11px] text-muted">
          Quantity
          <input
            type="number"
            min={1}
            max={item.packageRules?.maxQuantity ?? 1000}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={input}
            required
          />
        </label>
        <label className="text-[11px] text-muted">
          Starts
          <input type="date" min={min} max={max} value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className={input} required />
        </label>
        <label className="text-[11px] text-muted">
          Ends
          <input type="date" min={startsOn || min} max={max} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} className={input} required />
        </label>
      </div>
      {refusal && <ShopRefusal {...refusal} />}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40"
        >
          {pending ? "Adding…" : "Add to cart"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setRefusal(null);
          }}
          className="rounded-lg border border-line px-3.5 py-2 text-xs font-medium text-text hover:bg-surface"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
