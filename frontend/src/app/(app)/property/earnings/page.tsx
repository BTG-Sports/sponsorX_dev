import { Badge, Card, SectionHeading } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { PAYOUTS_NOTE, buildEarnings, type ApiAnalytics, type ApiLedger } from "@/lib/property-p2-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Earnings — 2S5-FE-02 (design Earnings.dc.html). The property's own share,
   from the ledger, to the cent.

   Reads GET /team/ledger      booked, reversed, paid, balance, the pending
                               buckets (awaiting payment · available ·
                               reserve) and whether they reconcile
         GET /team/analytics   revenue.byMonth for the monthly rows

   PROPERTY_MGR only (ledgerEntry own-property); a 403 is a login with no
   property. Honest gaps: no PAYOUT entry is ever written yet, so "paid" is
   always 0 — shown as "payouts start once the payment provider is
   connected", never as a payout history. No "Request payout", no held /
   disputed exceptions, no per-athlete split and no fee rates: the API has
   none of them.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyEarningsPage() {
  await requirePortalAccess("property");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Earnings and payouts</h1>
      <p className="mt-1 text-xs text-muted">Your property&rsquo;s share of every marketplace order, from the ledger, to the cent.</p>
    </div>
  );

  const [ledRes, anRes] = await Promise.all([apiFetch("/team/ledger"), apiFetch("/team/analytics")]);
  if (ledRes.status === 403 || anRes.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="chart" title="No property is linked to this login" hint="Earnings belong to a property's manager. Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (!ledRes.ok) throw new Error(`Ledger unavailable (${ledRes.status}).`);
  if (!anRes.ok) throw new Error(`Monthly revenue unavailable (${anRes.status}).`);
  const ledger = (await ledRes.json()) as ApiLedger;
  const analytics = (await anRes.json()) as ApiAnalytics;
  const e = buildEarnings(ledger, analytics.revenue.byMonth);

  return (
    <div className="space-y-6">
      {heading}

      {!e.reconciles && (
        <p role="alert" className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-warn">
          These totals don&rsquo;t reconcile with each other right now. Treat them as provisional and check with BTG finance before relying on them.
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {e.tiles.map((t) => (
          <li key={t.key} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-[11px] text-muted">{t.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{t.value}</p>
            <p className="mt-0.5 text-[11px] text-faint">{t.sub}</p>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeading
            title="How it adds up · all time"
            action={e.reconciles ? <Badge tone="accent">Reconciles</Badge> : <Badge tone="warn">Doesn&rsquo;t reconcile</Badge>}
          />
          <Card className="p-0">
            <ul className="divide-y divide-line-soft">
              {e.breakdown.map((b) => (
                <li key={b.key} className={`flex items-start justify-between gap-3 px-4 py-3 text-xs ${b.total ? "font-semibold" : ""}`}>
                  <span>
                    {b.label}
                    {b.note && <span className="block text-[11px] font-normal text-muted">{b.note}</span>}
                  </span>
                  <span className="tabular-nums">{b.value}</span>
                </li>
              ))}
            </ul>
          </Card>
          <p className="mt-2 text-[11px] text-faint">Reserve is held until each order closes, then moves to available. Figures are your property&rsquo;s own share only.</p>
        </section>

        <section>
          <SectionHeading title="Payouts" />
          <Card>
            <p className="text-sm font-semibold">No payouts yet</p>
            <p className="mt-1 text-xs text-muted">{PAYOUTS_NOTE} Until then, nothing here has been paid out.</p>
          </Card>
        </section>
      </div>

      <section>
        <SectionHeading title="By month" hint="Booked and reversed in the month each was posted." />
        {e.months.length === 0 ? (
          <EmptyState mark="chart" title="Nothing booked yet" hint="Your share appears here the day a sponsor's order for your inventory is booked." />
        ) : (
          <Card className="p-0">
            <div className="grid grid-cols-[1fr_7rem_7rem_7rem] gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint">
              <span>Month</span>
              <span className="text-right">Booked</span>
              <span className="text-right">Reversed</span>
              <span className="text-right">Net</span>
            </div>
            <ul className="divide-y divide-line-soft">
              {e.months.map((m) => (
                <li key={m.month} className="grid grid-cols-[1fr_7rem_7rem_7rem] gap-x-3 px-4 py-2.5 text-xs tabular-nums">
                  <span>{m.label}</span>
                  <span className="text-right">{m.booked}</span>
                  <span className="text-right text-muted">{m.reversed}</span>
                  <span className="text-right font-medium">{m.net}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
