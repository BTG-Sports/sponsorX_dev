/* --------------------------------------------------------------------------
   2S4-FE-01 / -02 — presentational pieces the shop, cart, checkout and order
   screens share. No hooks, no client JS of their own: usable from the server
   pages and from the shop-* client islands alike.
   -------------------------------------------------------------------------- */

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

/** The checkout step strip (2S4-FE-02): review the hold, confirm the billing
 *  contact, accept the order terms, place the order, confirmation. Payment
 *  follows on the order page once BTG approves — shown as the step after,
 *  never as one taken here. */
export function ShopSteps({ active }: { active: "review" | "billing" | "terms" | "place" | "confirmed" }) {
  const steps: { key: string; label: string; inert?: boolean }[] = [
    { key: "review", label: "Review hold" },
    { key: "billing", label: "Billing contact" },
    { key: "terms", label: "Order terms" },
    { key: "place", label: "Place order" },
    { key: "confirmed", label: "Confirmation" },
    { key: "payment", label: "Pay by card — after BTG approves", inert: true },
  ];
  const at = steps.findIndex((s) => s.key === active);
  return (
    <ol aria-label="Checkout steps" className="flex flex-wrap items-center gap-2 text-[11px]">
      {steps.map((s, i) => {
        const done = !s.inert && i < at;
        const current = s.key === active;
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              aria-current={current ? "step" : undefined}
              className={[
                "rounded-full border px-2.5 py-1 font-medium",
                s.inert
                  ? "border-dashed border-line text-faint"
                  : current
                    ? "border-primary/50 bg-primary/15 text-primary-soft"
                    : done
                      ? "border-line bg-surface-2 text-text"
                      : "border-line text-muted",
              ].join(" ")}
            >
              {done ? "✓ " : ""}
              {s.label}
            </span>
            {i < steps.length - 1 && <span aria-hidden="true" className="text-faint">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** How the order is paid (2S4-FE-02): the approval condition, then card
 *  payment on the order page. Nothing is charged at checkout. */
export function ShopPaymentNote() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2 px-4 py-3">
      <p className="text-xs font-semibold">Approval, then payment</p>
      <p className="mt-1 text-xs text-muted">
        Orders within your spending limit are approved straight away; a listing may ask its seller to accept first (they
        have 48 hours), and an order above your limit is checked by BTG. Then you pay the full total by card from the order
        page, on the payment provider&rsquo;s own page, within 3 days. Nothing is charged at checkout, and no card or bank
        details are asked for here.
      </p>
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
