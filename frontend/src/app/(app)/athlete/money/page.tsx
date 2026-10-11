import Link from "next/link";

import { ArenaChip, ArenaHead, ArenaLane, ArenaPanel, ArenaSection, ArenaTile, ArenaTiles, at, type ArenaTone } from "@/components/arena-stage";
import { EmptyState } from "@/components/states";
import { PayoutAccountPanel, StripeLinkButton } from "@/components/payout-account-panel";
import { PayoutTracker } from "@/components/payout-history";
import { PayoutRequest } from "@/components/payout-request";
import { ListFilter, ServerList } from "@/components/server-pager";
import { PagedTable, Primary, Td, Tr, type Column } from "@/components/stage-table";
import { apiListQuery, apiListQueryFor, pageOrAll, type PageInfo } from "@/lib/list-query";
import {
  FROZEN_LINE, HISTORY_KEYS, HISTORY_STATES, HISTORY_STATE_PARAM, accountPanel, approvalBadge, historyRows, historyState, moneyTiles, orderAvailable,
  orderStatusLabel, owedBackNotice, payeeFixPrompt, payoutTracker, requestButton, requestOrders, usd,
  type ApiMyPayoutHistory, type ApiMyPayoutOrders, type ApiMyPayouts, type ApiPayout, type ApiPayoutOrder,
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

   2S5-FE-09 — an order whose money a dispute froze (`frozen`) carries a
   "Frozen" badge, its Available cell reads as frozen rather than available
   (the API already leaves it out of the requestable balance), and one line
   under the row says BTG is reviewing a problem with the sponsor's payment.
   The API's `dispute` check renders in the checklist with the others.

   P1-ART-22 (2026-10-11) — "Payouts" on the Arena, as a dashboard: the
   title row with the ledger pill and the Request control, four KPI plates
   in cents from GET /payouts/me (moneyTiles — totals + byState), the
   owed-back notice, the account panel, the checklist as a plate with a lane
   (done / total), then the two lists SERVER-PAGED (memory:
   pagination-pattern):
     GET /payouts/me/orders?page&size                  → { orders, page }
     GET /payouts/me/history?page&size[&state=]        → { payouts, page, counts }
   The history keeps its own keys (?hpage / ?hsize / ?hstate). While the
   backend lands, a 404 on either route — or an answer without `page` —
   falls back to the blob's own `orders` / `payouts` as one page. GET
   /payouts/me itself is unchanged.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const ORDER_COLUMNS: Column[] = [
  { key: "order", label: "Order" },
  { key: "what", label: "Sponsor · what was sold" },
  { key: "share", label: "Your share", num: true },
  { key: "available", label: "Available", num: true },
  { key: "held", label: "Held", num: true },
  { key: "status", label: "Order status" },
];

const HISTORY_COLUMNS: Column[] = [
  { key: "when", label: "Requested" },
  { key: "orders", label: "Orders" },
  { key: "amount", label: "Amount", num: true },
  { key: "status", label: "Status" },
];

const CHIP_TONE: Record<string, ArenaTone> = { neutral: "ink", primary: "blue", accent: "win", warn: "warn", danger: "danger" };

/** A list route that may not be live yet: 404 → null (fall back to the blob); any other failure throws. */
async function pagedOrNull<T>(res: Response, path: string): Promise<T | null> {
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

export default async function MyMoneyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const state = historyState(sp[HISTORY_STATE_PARAM]);
  const ordersQuery = apiListQuery(sp, {});
  const historyQuery = apiListQueryFor(sp, HISTORY_KEYS, { state });
  const [res, ordRes, histRes] = await Promise.all([
    apiFetch("/payouts/me"),
    apiFetch(`/payouts/me/orders${ordersQuery}`).catch(() => null),
    apiFetch(`/payouts/me/history${historyQuery}`).catch(() => null),
  ]);
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        <ArenaHead title="Payouts" pill="Ledger · to the cent" />
        <EmptyState mark="inbox" title="Nothing to show for this login" hint="My money is the athlete's own. A parent or guardian follows it with the athlete." />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Your money is unavailable (${res.status}).`);
  const me = (await res.json()) as ApiMyPayouts;
  const ordersList = ordRes ? await pagedOrNull<ApiMyPayoutOrders>(ordRes, "/payouts/me/orders") : null;
  const historyList = histRes ? await pagedOrNull<ApiMyPayoutHistory>(histRes, "/payouts/me/history") : null;

  /* The lists: the paged routes' pages — or, until they are live, the blob's own lists as one page. */
  const orders: ApiPayoutOrder[] = ordersList?.orders ?? me.orders;
  const ordersPage: PageInfo = pageOrAll(orders, ordersList?.page);
  const payouts: ApiPayout[] = historyList?.payouts ?? (state ? me.payouts.filter((p) => p.state === state) : me.payouts);
  const historyPage: PageInfo = pageOrAll(payouts, historyList?.page);
  const historyTotal = historyList?.counts
    ? Object.values(historyList.counts).reduce((s, n) => s + (n ?? 0), 0)
    : me.byState
      ? Object.values(me.byState).reduce((s, x) => s + x.count, 0)
      : me.payouts.length;

  const request = requestButton(me);
  const requestable = requestOrders(me.orders);
  const reserve = me.totals.heldCents > 0 ? `${usd(me.totals.heldCents)} stays in reserve and is paid when the order closes.` : null;
  const linkAction = moneyAccountLinkAction.bind(null, "/athlete/money");
  const panel = accountPanel(me.account, me.payee.name);
  const unmet = me.checks.filter((c) => !c.ok);
  const done = me.checks.length - unmet.length;
  const hasMoney = me.orders.length > 0 || ordersPage.total > 0;
  const owedBack = owedBackNotice(me);
  const tiles = moneyTiles(me);
  const rows = historyRows(payouts);
  const byId = new Map(payouts.map((p) => [p.id, p]));

  return (
    <div className="space-y-8">
      <ArenaHead
        title="Payouts"
        pill="Ledger · to the cent"
        lede="Payouts go to your payout account on Stripe."
        actions={<PayoutRequest view={request} amount={usd(me.totals.requestableCents)} orders={requestable} action={moneyRequestAction} note={reserve} />}
      >
        <ArenaTiles>
          {tiles.map((t, i) => (
            <ArenaTile key={t.key} label={t.label} value={t.cents} format="usd" caption={t.caption} tone={t.tone} delay={0.1 + i * 0.06} />
          ))}
        </ArenaTiles>
      </ArenaHead>

      {owedBack && (
        <ArenaPanel tone="warn" delay={0.3} spot>
          <p role="status" className="text-sm font-semibold text-warn">{owedBack}.</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">A sponsor was refunded after your share was paid out — see the order below.</p>
        </ArenaPanel>
      )}

      <div className="sx-arena-in" style={at(0.34)}>
        <PayoutAccountPanel view={panel} action={linkAction} />
      </div>

      {hasMoney && unmet.length > 0 && (
        <section aria-labelledby="before-title">
          <ArenaPanel tone="flare" delay={0.38} spot>
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div className="min-w-0">
                <h2 id="before-title" className="text-sm font-semibold tracking-tight">Before you can request a payout</h2>
                <p className="mt-1 text-xs text-muted">{unmet.length === 1 ? "One thing left." : `${unmet.length} things left.`}</p>
              </div>
              <p className="text-right">
                <span className="sx-arena-num block text-[28px] leading-none text-accent">{done}<span className="text-base text-muted">/{me.checks.length}</span></span>
                <span className="block text-[11px] text-faint">done</span>
              </p>
            </div>
            <div role="progressbar" aria-label="Payout checklist" aria-valuenow={done} aria-valuemin={0} aria-valuemax={me.checks.length} className="mt-3">
              <ArenaLane value={me.checks.length ? done / me.checks.length : 0} tone="flare" delay={0.6} />
            </div>
            <ul className="mt-4 space-y-2">
              {me.checks.map((c, i) => (
                <li key={c.key} className={`sx-arena-in flex flex-wrap items-center gap-2 text-xs ${c.ok ? "" : "text-warn"}`} style={at(0.44 + i * 0.05)}>
                  <span aria-hidden="true" className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] ${c.ok ? "border-success/50 bg-success/15 text-success" : "border-warn/50 bg-warn/15 text-warn"}`}>{c.ok ? "✓" : "●"}</span>
                  <span>
                    <span className="font-medium">{c.ok ? "Done" : "Not yet"}</span> · {c.label}
                  </span>
                  {!c.ok && c.key === "account" && (
                    <span className="basis-full pl-7">
                      <StripeLinkButton cta={panel.cta} action={linkAction} testBadge={panel.testBadge} />
                      <span className="mt-1 block text-[11px] text-muted">You add bank and tax details on Stripe&rsquo;s secure page, then come back here. SponsorX never sees them.</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </ArenaPanel>
        </section>
      )}

      <ServerList>
        <section aria-labelledby="by-order-title">
          <ArenaSection title="By order" hint="Your share of each order, what's available and what's held." delay={0.46} />
          <h2 id="by-order-title" className="sr-only">By order</h2>
          {orders.length === 0 ? (
            <EmptyState mark="inbox" title="No orders yet" hint="When a sponsor buys one of your items and pays, your share appears here." />
          ) : (
            <PagedTable bare page={ordersPage} noun="Orders" label="Your share by order" columns={ORDER_COLUMNS} tone="athlete">
              {orders.flatMap((o, i) => {
                /* 2S8-QA-05 — the real figure, negative when a refund came after the payout. */
                const available = orderAvailable(o);
                /* 2S5-FE-09 — frozen by a dispute: the figure is held, not available. */
                const frozen = o.frozen === true;
                const hot = frozen || Boolean(available.owedBack);
                const row = (
                  <Tr key={o.orderId} i={i} tone={hot ? "warn" : undefined}>
                    <Td><Primary>{o.orderRef}</Primary></Td>
                    <Td label="Sponsor">
                      <Primary sub={o.title ?? undefined}>
                        {o.sponsorName ?? "—"}
                        {frozen && <span className="ml-2 inline-block align-middle"><ArenaChip tone="warn">Frozen</ArenaChip></span>}
                      </Primary>
                    </Td>
                    <Td label="Your share" num><span className="sx-arena-num text-sm text-text">{usd(o.shareCents)}</span></Td>
                    <Td label={frozen ? "Frozen" : "Available"} num className={hot ? "text-warn" : undefined}>
                      <span className="sx-arena-num text-sm">{available.value}</span>
                      {frozen && <span className="block text-[11px]">frozen, not available</span>}
                      {available.owedBack && <span className="block text-[11px]">{available.owedBack}</span>}
                    </Td>
                    <Td label="Held" num><span className="sx-arena-num text-sm text-text">{usd(o.heldCents)}</span></Td>
                    <Td label="Order status" muted>{orderStatusLabel(o.state)}</Td>
                  </Tr>
                );
                return frozen
                  ? [row, (
                    <Tr key={`${o.orderId}-frozen`} i={i} tone="warn" className="sx-table-detail">
                      <Td colSpan={ORDER_COLUMNS.length}><p className="text-[11px] text-warn">{FROZEN_LINE}</p></Td>
                    </Tr>
                  )]
                  : [row];
              })}
            </PagedTable>
          )}
        </section>

        <section aria-labelledby="history-title" className="mt-8">
          <ArenaSection
            title={`Payout history · ${historyTotal}`}
            hint="Follow each payout from request to paid."
            action={<ListFilter param={HISTORY_STATE_PARAM} value={state} label="Filter payouts by state" allLabel="All states" options={HISTORY_STATES.map((s) => ({ value: s.value, label: s.label }))} tone="athlete" keys={HISTORY_KEYS} />}
            delay={0.5}
          />
          <h2 id="history-title" className="sr-only">Payout history</h2>
          {rows.length === 0 ? (
            <EmptyState
              mark="inbox"
              title={state ? "No payout in that state" : "No payouts yet"}
              hint={state ? "Pick another state, or all states, to see the rest." : "When you request one, you can follow it here from request to paid."}
            />
          ) : (
            <PagedTable bare page={historyPage} noun="Payouts" filtered={state !== ""} label="Payout history" columns={HISTORY_COLUMNS} tone="athlete" keys={HISTORY_KEYS}>
              {rows.flatMap((r, i) => {
                const p = byId.get(r.id)!;
                const auto = approvalBadge(p);
                const fix = payeeFixPrompt(p, "/athlete/money#payout-account");
                const steps = payoutTracker(p);
                const hot = r.status.tone === "warn" || r.status.tone === "danger" || Boolean(fix);
                const row = (
                  <Tr key={r.id} i={i} tone={hot ? "warn" : undefined}>
                    <Td><Primary>{r.date}</Primary></Td>
                    <Td label="Orders" muted>
                      {r.orders.length === 1 ? "Order " : "Orders "}
                      <span className="tabular-nums">{r.orders.join(", ")}</span>
                    </Td>
                    <Td label="Amount" num><span className="sx-arena-num text-sm text-text">{r.amount}</span></Td>
                    <Td label="Status">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <ArenaChip tone={CHIP_TONE[r.status.tone] ?? "ink"}>{r.status.label}</ArenaChip>
                        {/* The tracker already names the automatic approval while it is on its way; the chip stays once paid. */}
                        {auto && p.state === "PAID" && <ArenaChip tone="win">✓ {auto}</ArenaChip>}
                      </span>
                    </Td>
                  </Tr>
                );
                if (!fix && !steps) return [row];
                return [row, (
                  <Tr key={`${r.id}-detail`} i={i} tone={hot ? "warn" : undefined} className="sx-table-detail">
                    <Td colSpan={HISTORY_COLUMNS.length}>
                      {fix && (
                        <div className="rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-[11px]">
                          <Link href={fix.href} className="font-medium text-athlete hover:underline">{fix.label} →</Link>
                          <span className="mt-0.5 block text-muted">{fix.note}</span>
                        </div>
                      )}
                      {steps && <PayoutTracker steps={steps} />}
                    </Td>
                  </Tr>
                )];
              })}
            </PagedTable>
          )}
        </section>
      </ServerList>
    </div>
  );
}
