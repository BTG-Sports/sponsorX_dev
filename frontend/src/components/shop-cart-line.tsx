"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeLineAction, updateLineAction } from "@/app/(app)/sponsor/cart/actions";
import { ShopRefusal } from "@/components/shop-bits";
import { isoDay, lineSeller, usd, validateLine, type ApiCartLine } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-01 — one cart line: quantity and dates editable, Save and Remove.
   Read-only when the viewer can't write (SPONSOR_ANALYST) or the cart is
   known to be held (frozen). If the hold is live but this page didn't know,
   the API's 409 says so and is shown as-is.
   -------------------------------------------------------------------------- */

const input =
  "w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs text-text focus:border-primary/50 focus:outline-none disabled:opacity-60";

export function ShopCartLine({ line, editable }: { line: ApiCartLine; editable: boolean }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(String(line.quantity));
  const [startsOn, setStartsOn] = useState(isoDay(line.startsOn));
  const [endsOn, setEndsOn] = useState(isoDay(line.endsOn));
  const [refusal, setRefusal] = useState<{ message: string; reasons: string[] } | null>(null);
  const [pending, begin] = useTransition();

  const dirty = Number(quantity) !== line.quantity || startsOn !== isoDay(line.startsOn) || endsOn !== isoDay(line.endsOn);

  const save = () => {
    const qty = Number(quantity);
    const problems = validateLine({ quantity: qty, startsOn, endsOn });
    if (problems.length) {
      setRefusal({ message: "Check the line:", reasons: problems });
      return;
    }
    setRefusal(null);
    begin(async () => {
      const r = await updateLineAction(line.id, qty, startsOn, endsOn);
      if (r.ok) router.refresh();
      else setRefusal({ message: r.message, reasons: r.reasons });
    });
  };

  const remove = () => {
    setRefusal(null);
    begin(async () => {
      const r = await removeLineAction(line.id);
      if (r.ok) router.refresh();
      else setRefusal({ message: r.message, reasons: r.reasons });
    });
  };

  return (
    <li className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{line.title}</p>
          <p className="mt-0.5 text-[11px] text-muted">
            {lineSeller(line)} · {usd(line.unitPriceCents)} each
          </p>
        </div>
        <p className="text-sm font-semibold tabular-nums">{usd(line.lineTotalCents)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:max-w-md">
        <label className="text-[11px] text-muted">
          Quantity
          <input
            type="number"
            min={1}
            max={1000}
            value={quantity}
            disabled={!editable || pending}
            onChange={(e) => setQuantity(e.target.value)}
            className={input}
          />
        </label>
        <label className="text-[11px] text-muted">
          Starts
          <input type="date" value={startsOn} disabled={!editable || pending} onChange={(e) => setStartsOn(e.target.value)} className={input} />
        </label>
        <label className="text-[11px] text-muted">
          Ends
          <input type="date" min={startsOn} value={endsOn} disabled={!editable || pending} onChange={(e) => setEndsOn(e.target.value)} className={input} />
        </label>
      </div>

      {refusal && <ShopRefusal {...refusal} />}

      {editable && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-cta-ink hover:bg-primary-soft disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-2 hover:text-text disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      )}
    </li>
  );
}
