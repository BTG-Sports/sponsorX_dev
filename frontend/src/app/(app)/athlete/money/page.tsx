import { Card, SectionHeading } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { PayoutAccountPanel, StripeLinkButton } from "@/components/payout-account-panel";
import { PayoutHistory } from "@/components/payout-history";
import { PayoutRequest } from "@/components/payout-request";
import {
  accountPanel, orderStatusLabel, payoutTiles, requestButton, requestOrders, usd, type ApiMyPayouts,
} from "@/lib/payouts-live";
import { apiFetch } from "@/server/api";
import { moneyAccountLinkAction, moneyRequestAction } from "./actions";

/* --------------------------------------------------------------------------
   My money — 2S5-FE-03, the athlete's side (Claude Design MyMoney.dc.html).

   Reads  GET /payouts/me     what can be requested now, what is held in
                              reserve, what has been paid; the four payout
                              rules; each order's share; every payout.
   Writes POST /payouts/account/link   the payout-account set-up on Stripe ↗
          POST /payouts                request the whole available balance

   Every figure is the API's. Stripe is named only where Riley acts on it
   (the account); payouts say "confirmed by the payment provider". Nothing
   here shows a bank detail — SponsorX has none.

   403 (a guardian's login, or an athlete with no marketplace money yet
   reachable) shows a plain explanation; other failures throw to the error
   page. Phase 1 campaign earnings stay on /athlete/earnings.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function MyMoneyPage() {
  const res = await apiFetch("/payouts/me");
  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">My money</h1>
      <p className="mt-1 text-xs text-muted">From the ledger, to the cent. Payouts go to your payout account on Stripe.</p>
    </div>
  );
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState mark="inbox" title="Nothing to show for this login" hint="My money is the athlete's own. A parent or guardian follows it with the athlete." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Your money is unavailable (${res.status}).`);
  const me = (await res.json()) as ApiMyPayouts;

  const request = requestButton(me);
  const orders = requestOrders(me.orders);
  const reserve = me.totals.heldCents > 0 ? `${usd(me.totals.heldCents)} stays in reserve and is paid when the order closes.` : null;
  const linkAction = moneyAccountLinkAction.bind(null, "/athlete/money");
  const panel = accountPanel(me.account, me.payee.name);
  const unmet = me.checks.filter((c) => !c.ok);
  const hasMoney = me.orders.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {heading}
        <PayoutRequest view={request} amount={usd(me.totals.requestableCents)} orders={orders} action={moneyRequestAction} note={reserve} />
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        {payoutTiles(me).map((t) => (
          <li key={t.key} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-[11px] text-muted">{t.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{t.value}</p>
            <p className="mt-0.5 text-[11px] text-faint">{t.sub}</p>
          </li>
        ))}
      </ul>

      <PayoutAccountPanel view={panel} action={linkAction} />

      {hasMoney && unmet.length > 0 && (
        <section aria-labelledby="before-title">
          <Card>
            <h2 id="before-title" className="text-sm font-semibold tracking-tight">Before you can request a payout</h2>
            <p className="mt-1 text-xs text-muted">
              {me.checks.length - unmet.length} of {me.checks.length} done. {unmet.length === 1 ? "One thing left." : `${unmet.length} things left.`}
            </p>
            <ul className="mt-3 space-y-2">
              {me.checks.map((c) => (
                <li key={c.key} className={`flex flex-wrap items-center gap-2 text-xs ${c.ok ? "" : "text-warn"}`}>
                  <span aria-hidden="true" className={c.ok ? "text-accent" : ""}>{c.ok ? "✓" : "●"}</span>
                  <span>
                    <span className="font-medium">{c.ok ? "Done" : "Not yet"}</span> · {c.label}
                  </span>
                  {!c.ok && c.key === "account" && (
                    <span className="basis-full pl-5">
                      <StripeLinkButton cta={panel.cta} action={linkAction} testBadge={panel.testBadge} />
                      <span className="mt-1 block text-[11px] text-muted">You add bank and tax details on Stripe&rsquo;s secure page, then come back here. SponsorX never sees them.</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <SectionHeading title="By order" hint="Your share of each order, what's available and what's held." />
        {!hasMoney ? (
          <EmptyState mark="inbox" title="No orders yet" hint="When a sponsor buys one of your items and pays, your share appears here." />
        ) : (
          <Card className="p-0">
            <div className="hidden grid-cols-[7rem_1fr_6rem_6rem_6rem_8rem] gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid">
              <span>Order</span>
              <span>Sponsor · what was sold</span>
              <span className="text-right">Your share</span>
              <span className="text-right">Available</span>
              <span className="text-right">Held</span>
              <span className="text-right">Order status</span>
            </div>
            <ul className="divide-y divide-line-soft">
              {me.orders.map((o) => (
                <li key={o.orderId} className="grid gap-x-3 gap-y-1 px-4 py-3 text-xs md:grid-cols-[7rem_1fr_6rem_6rem_6rem_8rem] md:items-center">
                  <span className="font-medium tabular-nums">{o.orderRef}</span>
                  <span className="min-w-0 text-muted">
                    <span className="text-text">{o.sponsorName}</span>
                    {o.title && <span className="block truncate text-[11px]">{o.title}</span>}
                  </span>
                  <span className="tabular-nums md:text-right"><span className="text-muted md:hidden">Your share </span>{usd(o.shareCents)}</span>
                  <span className="tabular-nums md:text-right"><span className="text-muted md:hidden">Available </span>{usd(Math.max(0, o.availableCents - o.inFlightCents))}</span>
                  <span className="tabular-nums md:text-right"><span className="text-muted md:hidden">Held </span>{usd(o.heldCents)}</span>
                  <span className="text-muted md:text-right">{orderStatusLabel(o.state)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <SectionHeading title="Payout history" hint="Follow each payout from request to paid." />
        <PayoutHistory fixHref="/athlete/money#payout-account" payouts={me.payouts} emptyHint="When you request one, you can follow it here from request to paid." />
      </section>
    </div>
  );
}
