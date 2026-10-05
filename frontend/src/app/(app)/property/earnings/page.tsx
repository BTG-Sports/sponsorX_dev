import { Badge, Card, SectionHeading } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { PayoutAccountPanel } from "@/components/payout-account-panel";
import { PayoutHistory } from "@/components/payout-history";
import { PayoutRequest } from "@/components/payout-request";
import { PAYOUTS_NOTE, buildEarnings, type ApiAnalytics, type ApiLedger } from "@/lib/property-p2-live";
import {
  accountPanel, owedBackNotice, payoutTiles, requestButton, requestOrders, showChecklist, usd, type ApiMyPayouts,
} from "@/lib/payouts-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { payoutAccountLinkAction, requestPayoutAction } from "./actions";

/* --------------------------------------------------------------------------
   Earnings and payouts — 2S5-FE-02, 2S5-FE-03 (team part) (design
   Earnings.dc.html). The property's own share, from the ledger, to the cent,
   and the payouts that send it to the property's account on Stripe.

   Reads  GET /team/ledger      booked, reversed, paid, balance, the pending
                                buckets and whether they reconcile
          GET /team/analytics   revenue.byMonth for the monthly rows
          GET /payouts/me       the payout account (its `account` is
                                GET /payouts/account's view), the payout
                                totals, canRequest + the four checks, the
                                orders a request would include, history
   Writes POST /payouts/account/link {returnPath:"/property/earnings"} →
                                redirect to Stripe (payoutAccountLinkAction)
          POST /payouts         request the whole requestable balance
                                (requestPayoutAction; a 409 shows its message)

   PROPERTY_MGR only (ledgerEntry / payout / payoutAccount own-property); a
   403 is a login with no property. Honest gaps: no held / disputed
   exceptions, no per-athlete split and no fee rates — the API has none.
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

  const [ledRes, anRes, payRes] = await Promise.all([apiFetch("/team/ledger"), apiFetch("/team/analytics"), apiFetch("/payouts/me")]);
  if (ledRes.status === 403 || anRes.status === 403 || payRes.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="chart" title="No property is linked to this login" hint="Earnings belong to a property's manager. Ask BTG to link your login to your team or school." />
      </div>
    );
  }
  if (!ledRes.ok) throw new Error(`Ledger unavailable (${ledRes.status}).`);
  if (!anRes.ok) throw new Error(`Monthly revenue unavailable (${anRes.status}).`);
  if (!payRes.ok) throw new Error(`Payouts unavailable (${payRes.status}).`);
  const ledger = (await ledRes.json()) as ApiLedger;
  const analytics = (await anRes.json()) as ApiAnalytics;
  const me = (await payRes.json()) as ApiMyPayouts;
  const e = buildEarnings(ledger, analytics.revenue.byMonth);
  /* The design's three payout tiles, plus the ledger's "awaiting sponsor
     payment" — the one existing tile they don't already cover. */
  const tiles = [...payoutTiles(me), ...e.tiles.filter((t) => t.key === "awaiting")];
  const request = requestButton(me);
  const linkAction = payoutAccountLinkAction.bind(null, "/property/earnings");
  /* 2S8-QA-05 — a refund after a payout leaves money owed back; never shown as $0. */
  const owedBack = owedBackNotice(me);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {heading}
        <PayoutRequest view={request} amount={usd(me.totals.requestableCents)} orders={requestOrders(me.orders)} action={requestPayoutAction} />
      </div>

      {owedBack && (
        <p role="status" className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-warn">
          {owedBack}. A sponsor was refunded after your property&rsquo;s share was paid out.
        </p>
      )}

      {!e.reconciles && (
        <p role="alert" className="rounded-lg border border-warn/30 bg-warn/8 px-3 py-2 text-xs text-warn">
          These totals don&rsquo;t reconcile with each other right now. Treat them as provisional and check with BTG finance before relying on them.
        </p>
      )}

      <PayoutAccountPanel view={accountPanel(me.account, me.payee.name)} action={linkAction} />

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <li key={t.key} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-[11px] text-muted">{t.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{t.value}</p>
            <p className="mt-0.5 text-[11px] text-faint">{t.sub}</p>
          </li>
        ))}
      </ul>

      {showChecklist(me) && (
        <section aria-labelledby="cant-request-title">
          <Card>
            <h2 id="cant-request-title" className="text-sm font-semibold tracking-tight">Can&rsquo;t request yet</h2>
            <p className="mt-1 text-xs text-muted">A payout can be requested once all of these are true for at least one order.</p>
            <ul className="mt-3 space-y-1.5">
              {me.checks.map((c) => (
                <li key={c.key} className={`flex items-start gap-2 text-xs ${c.ok ? "" : "text-warn"}`}>
                  <span aria-hidden="true" className={c.ok ? "text-accent" : ""}>{c.ok ? "✓" : "●"}</span>
                  <span>
                    <span className="font-medium">{c.ok ? "Done" : "Not yet"}</span> · {c.label}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

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
                    {b.note && b.note !== PAYOUTS_NOTE && <span className="block text-[11px] font-normal text-muted">{b.note}</span>}
                  </span>
                  <span className="tabular-nums">{b.value}</span>
                </li>
              ))}
            </ul>
          </Card>
          <p className="mt-2 text-[11px] text-faint">Reserve is held until each order closes, then moves to available. Figures are your property&rsquo;s own share only.</p>
        </section>

        <section>
          <SectionHeading title="Payout history" hint="Each payout, the orders it covers and where it stands." />
          <PayoutHistory fixHref="/property/earnings#payout-account"
            payouts={me.payouts}
            emptyHint={me.account.status === "READY" ? "Your first payout can be requested once an order is paid, delivered and past its holding period." : "Set up your payout account on Stripe (above) so money can be sent once your first order closes."}
          />
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
