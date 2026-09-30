import { Badge, Card } from "@/components/ui";
import { historyRows, payoutTracker, type ApiPayout, type TrackerStep } from "@/lib/payouts-live";

/* --------------------------------------------------------------------------
   Payout history — 2S5-FE-02 (design Earnings.dc.html). Every payout from
   GET /payouts/me: when it was requested, the amount, the orders it covers
   and its status in words (never colour alone). No card or bank numbers —
   "confirmed by the payment provider" is as far as a status goes.
   -------------------------------------------------------------------------- */

/** Requested → Approved by BTG → Sent → Paid (2S5-FE-03, design MyMoney). */
export function PayoutTracker({ steps, vertical = false }: { steps: TrackerStep[]; vertical?: boolean }) {
  return (
    <ol className={`mt-3 grid gap-2 ${vertical ? "grid-cols-1" : "grid-cols-4"}`} aria-label="Where this payout is">
      {steps.map((s, i) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="min-w-0">
          <span className={`flex items-center gap-1.5 text-[11px] ${s.state === "todo" ? "text-faint" : "font-medium"}`}>
            <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] ${s.state === "done" ? "border-accent/50 bg-accent/15 text-accent" : s.state === "current" ? "border-primary/60 bg-primary/15 text-primary" : "border-line text-faint"}`}>
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className="truncate">{s.label}</span>
            <span className="sr-only">{s.state === "done" ? " — done" : s.state === "current" ? " — current step" : " — not yet"}</span>
          </span>
          {s.note && <span className={`mt-0.5 block pl-6 text-[10px] ${s.state === "current" ? "text-primary" : "text-muted"}`}>{s.note}</span>}
        </li>
      ))}
    </ol>
  );
}

export function PayoutHistory({ payouts, emptyHint }: { payouts: ApiPayout[]; emptyHint?: string }) {
  const rows = historyRows(payouts);
  const byId = new Map(payouts.map((p) => [p.id, p]));
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
            {(() => {
              const steps = payoutTracker(byId.get(r.id)!);
              return steps ? <div className="w-full"><PayoutTracker steps={steps} /></div> : null;
            })()}
          </li>
        ))}
      </ul>
    </Card>
  );
}
