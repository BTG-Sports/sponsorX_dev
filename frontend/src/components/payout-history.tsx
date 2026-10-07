import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import { approvalBadge, historyRows, payeeFixPrompt, payoutTracker, type ApiPayout, type TrackerStep } from "@/lib/payouts-live";

/* --------------------------------------------------------------------------
   Payout history — 2S5-FE-02 (design Earnings.dc.html). Every payout from
   GET /payouts/me: when it was requested, the amount, the orders it covers
   and its status in words (never colour alone). No card or bank numbers —
   "confirmed by the payment provider" is as far as a status goes.

   2S5-FE-06 — "Approved automatically" on a payout the rule approved, "BTG
   is reviewing this payout" on one waiting for BTG (never why), and for a
   payout waiting on the payee's account, "Your payout couldn't be sent —
   fix your payout account" with the link (`fixHref`, the money page).

   2S5-FE-10 — a payout the payee's bank returned (`returnedAt`) reads
   "Returned by your bank: fix your payout account" (payoutStatus) and the
   same fix link, with the note that it is sent again once the account is
   ready (payeeFixPrompt).
   -------------------------------------------------------------------------- */

/** Requested → Approved by BTG → Sent → Paid (2S5-FE-03, design MyMoney). */
export function PayoutTracker({ steps, vertical = false }: { steps: TrackerStep[]; vertical?: boolean }) {
  return (
    <ol className={`mt-3 grid gap-2 ${vertical ? "grid-cols-1" : "grid-cols-4"}`} aria-label="Where this payout is">
      {steps.map((s, i) => (
        <li key={s.label} aria-current={s.state === "current" ? "step" : undefined} className="min-w-0">
          <span className={`flex items-start gap-1.5 text-[11px] ${s.state === "todo" ? "text-faint" : "font-medium"}`}>
            <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] ${s.state === "done" ? "border-accent/50 bg-accent/15 text-accent" : s.state === "current" ? "border-primary/60 bg-primary/15 text-primary" : "border-line text-faint"}`}>
              {s.state === "done" ? "✓" : i + 1}
            </span>
            <span className="min-w-0 leading-tight">{s.label}</span>
            <span className="sr-only">{s.state === "done" ? " — done" : s.state === "current" ? " — current step" : " — not yet"}</span>
          </span>
          {s.note && <span className={`mt-0.5 block pl-6 text-[10px] ${s.state === "current" ? "text-primary" : "text-muted"}`}>{s.note}</span>}
        </li>
      ))}
    </ol>
  );
}

export function PayoutHistory({ payouts, emptyHint, fixHref }: { payouts: ApiPayout[]; emptyHint?: string; fixHref: string }) {
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
              {(() => {
                const p = byId.get(r.id)!;
                const auto = approvalBadge(p);
                /* The tracker already names the automatic approval while it is on its way; the badge stays once paid. */
                return auto && p.state === "PAID" ? <Badge tone="accent">✓ {auto}</Badge> : null;
              })()}
            </span>
            {(() => {
              const fix = payeeFixPrompt(byId.get(r.id)!, fixHref);
              return fix ? (
                <div className="w-full rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-[11px]">
                  <Link href={fix.href} className="font-medium text-primary hover:underline">{fix.label} →</Link>
                  <span className="mt-0.5 block text-muted">{fix.note}</span>
                </div>
              ) : null;
            })()}
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
