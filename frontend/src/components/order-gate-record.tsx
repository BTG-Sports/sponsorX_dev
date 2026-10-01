import { Card } from "@/components/ui";
import { billingLines, termsLabel, type OrderGateRecord } from "@/lib/checkout-gate";
import { fmtStamp } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-02 — the contract gate's record on a placed order: the billing
   contact the sponsor confirmed at checkout and their acceptance of the
   order terms (who, when, which version). Shown on the sponsor's order page
   and on BTG's order view; every value is a field of
   GET /marketplace-orders/:id. No hooks — a server-page piece.
   -------------------------------------------------------------------------- */

export function OrderGateRecordCard({ order }: { order: OrderGateRecord }) {
  const billing = billingLines(order);
  const a = order.acceptance;
  return (
    <Card className="space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-muted">Billing contact</p>
        {billing ? (
          <ul className="mt-1 space-y-0.5 break-words text-xs">
            {billing.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted">None recorded — this order was placed before checkout asked for one.</p>
        )}
      </div>
      <div className="border-t border-line-soft pt-3">
        <p className="text-[11px] uppercase tracking-wide text-muted">Order terms</p>
        {a ? (
          <p className="mt-1 break-words text-xs">
            {termsLabel(a.agreement)} — accepted {fmtStamp(a.acceptedAt)}
            {a.user?.email ? ` by ${a.user.email}` : ""}.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">No acceptance recorded — this order was placed before checkout asked for one.</p>
        )}
      </div>
    </Card>
  );
}
