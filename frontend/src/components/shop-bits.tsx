/* --------------------------------------------------------------------------
   2S4-FE-01 / -02 — presentational pieces the shop, cart, checkout and order
   screens share. No hooks, no client JS of their own: usable from the server
   pages and from the shop-* client islands alike.
   -------------------------------------------------------------------------- */

import { checkoutPaymentWords } from "@/lib/checkout-gate";
import { fmtDay, lineSeller, usd, type ShopLine } from "@/lib/shop-live";

/** A refusal: the message, then every reason the API gave as a list. */
export function ShopRefusal({ message, reasons }: { message: string; reasons: string[] }) {
  return (
    <div role="alert" className="rounded-lg border border-danger/30 bg-danger/8 px-3 py-2 text-xs text-danger">
      <p>{message}</p>
      {reasons.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {reasons.map((r, i) => (
            <li key={`${i}-${r}`}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** How the order is paid (2S4-FE-02): the approval condition, then card
 *  payment on the order page. Nothing is charged at checkout. POL-FE-04:
 *  with card payment closed (`paymentsOpen` false) it says the order is held
 *  and a pay-by date is emailed when payment opens. */
export function ShopPaymentNote({ paymentsOpen }: { paymentsOpen?: boolean } = {}) {
  const w = checkoutPaymentWords(paymentsOpen);
  return (
    <div role={w.held ? "status" : undefined} className={`rounded-xl border border-dashed px-4 py-3 ${w.held ? "border-primary/40 bg-primary/8" : "border-line bg-surface-2"}`}>
      <p className="text-xs font-semibold">{w.title}</p>
      <p className="mt-1 text-xs text-muted">{w.text}</p>
    </div>
  );
}

/** One cart or order line as checkout and the order page list it: who sells
 *  it — the team, or the independent athlete, who has no property
 *  (2S3-FE-03) — then quantity, unit price and dates. */
export function ShopLineRow({ line: l }: { line: ShopLine }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{l.title}</p>
        <p className="mt-0.5 text-[11px] text-muted">
          {lineSeller(l)} · {l.quantity} × {usd(l.unitPriceCents)} · {fmtDay(l.startsOn)} – {fmtDay(l.endsOn)}
        </p>
      </div>
      <p className="text-sm font-semibold tabular-nums">{usd(l.lineTotalCents)}</p>
    </li>
  );
}
