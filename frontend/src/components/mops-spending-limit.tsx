import { Card, SectionHeading } from "@/components/ui";
import { limitHistory, limitRule, limitStanding, money, type ApiSpendingLimit } from "@/lib/order-automation-live";

/* --------------------------------------------------------------------------
   2S4-FE-05 — a sponsor's spending limit, for BTG (OrderExceptions.dc.html,
   view limit). Every figure is GET /sponsors/:id/spending-limit's: the limit
   now, the rule it follows (start, cap), where it stands, and its history —
   the completed, refunded and upheld orders that moved it, oldest first.
   Nothing is stored; the API replays it from the sponsor's own orders.
   -------------------------------------------------------------------------- */

export function SpendingLimitCard({ limit: l }: { limit: ApiSpendingLimit }) {
  const history = limitHistory(l);
  return (
    <Card>
      <section aria-label="Spending limit" className="flex flex-col gap-3">
        <SectionHeading title="Spending limit" hint={l.sponsorName} />
        <p className="text-[13px] text-muted">
          Current limit: <strong className="text-2xl font-semibold tabular-nums text-text">{money(l.limitCents)}</strong>
        </p>
        <p className="text-xs text-muted">{limitStanding(l)}</p>
        <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-xs leading-relaxed">{limitRule(l)}</p>
        <h3 className="text-[13px] font-semibold">History</h3>
        {history.length === 0 ? (
          <p className="text-xs text-muted">Nothing has moved it yet — it is at the starting {money(l.startCents)}.</p>
        ) : (
          <ol className="text-xs">
            {history.map((h, i) => (
              <li key={i} className="flex flex-col gap-0.5 border-t border-line-soft py-2 sm:flex-row sm:gap-3">
                <span className="shrink-0 text-muted sm:w-14">{h.when}</span>
                <span className="min-w-0 text-text/85">{h.text}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Card>
  );
}
