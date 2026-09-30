import { Badge, Card } from "@/components/ui";
import { historyRows, type ApiPayout } from "@/lib/payouts-live";

/* --------------------------------------------------------------------------
   Payout history — 2S5-FE-02 (design Earnings.dc.html). Every payout from
   GET /payouts/me: when it was requested, the amount, the orders it covers
   and its status in words (never colour alone). No card or bank numbers —
   "confirmed by the payment provider" is as far as a status goes.
   -------------------------------------------------------------------------- */

export function PayoutHistory({ payouts, emptyHint }: { payouts: ApiPayout[]; emptyHint?: string }) {
  const rows = historyRows(payouts);
  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-sm font-semibold">No payouts yet</p>
        {emptyHint && <p className="mt-1 text-xs text-muted">{emptyHint}</p>}
      </Card>
    );
  }
  return (
    <Card className="p-0">
      <ul className="divide-y divide-line-soft">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-xs">
            <span className="min-w-0">
              <span className="block font-medium">{r.date}</span>
              <span className="block text-[11px] text-muted">
                {r.orders.length === 1 ? "Order " : "Orders "}
                <span className="tabular-nums">{r.orders.join(", ")}</span>
              </span>
            </span>
            <span className="flex flex-col items-end gap-1 text-right">
              <span className="text-sm font-semibold tabular-nums">{r.amount}</span>
              <Badge tone={r.status.tone}>{r.status.label}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
