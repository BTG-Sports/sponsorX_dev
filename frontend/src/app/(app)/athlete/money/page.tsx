import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ArenaHead, ArenaUpdated } from "@/components/arena-stage";
import { AccountCard, CashOut, MoneyChecklist, MoneyRoadHelp } from "@/components/athlete-money/money-board";
import { MoneyGlyph } from "@/components/athlete-money/money-glyphs";
import { FirstMoneyHero } from "@/components/athlete-money/money-hero";
import { MoneyTabs } from "@/components/athlete-money/money-lists";
import { ServerList } from "@/components/server-pager";
import { EmptyState, ErrorPanel, SkeletonRows } from "@/components/states";
import { cashBoard, moneySidings, moneyStations, orderMoneyCard, payoutCard, payoutTabs, sampleMoney } from "@/lib/athlete-money-shop";
import { demoState } from "@/lib/demo";
import { apiListQuery, apiListQueryFor, pageOrAll, type PageInfo } from "@/lib/list-query";
import {
  HISTORY_KEYS, HISTORY_STATE_PARAM, accountPanel, historyState, owedBackNotice, requestOrders, usd, waitingPayouts,
  type ApiMyPayoutHistory, type ApiMyPayoutOrders, type ApiMyPayouts, type ApiPayout, type ApiPayoutOrder, type PayoutState,
} from "@/lib/payouts-live";
import { apiFetch, fetchActor } from "@/server/api";
import { moneyAccountLinkAction, moneyRequestAction, moneySampleLinkAction } from "./actions";

import "../inventory/inventory.css";
import "./money.css";

/* --------------------------------------------------------------------------
   My money — 2S5-FE-03, the athlete's side.

   Reads  GET /payouts/me     what can be requested now, what is held in
                              reserve, what has been paid; the payout rules;
                              each order's share; every payout.
          GET /payouts/me/orders?page&size              → { orders, page }
          GET /payouts/me/history?page&size[&state=]    → { payouts, page, counts }
                              (P1-ART-22, SERVER-PAGED; the history keeps its
                              own keys ?hpage / ?hsize / ?hstate. A 404, or an
                              answer without `page`, falls back to the blob's
                              own list as one page.)
   Writes POST /payouts/account/link   the payout-account set-up on Stripe ↗
          POST /payouts                request the whole available balance

   Every figure is the API's. Stripe is named only where the athlete acts on
   it (the account); payouts say "confirmed by the payment provider". Nothing
   here shows a bank detail — SponsorX has none. A minor's own login sees who
   sets the account up, never the Stripe button (POL-FE-26). A frozen order
   (2S5-FE-09) says "Frozen" and BTG's one sentence. 403 shows a plain
   explanation; other failures show the error panel.

   POL-FE-97 (2026-11-16) — redrawn like Inventory, Listings and Sales
   (POL-FE-83/84/95). The owner: the old page was "so confusing for a human"
   — four KPI plates, a ledger table led by order refs, a status column in
   jargon. Top to bottom now:
     1. the title, with "How money moves" and Sales beside it. The help
        button opens the road in a popup: Sponsor pays → Unlocking → Ready
        → On its way → Paid, the API's totals at each stop; in reserve,
        frozen and owed back off the road (owner: "make this inside a popup
        panel which trigger by a help button");
     2. the cash-out board: how much can be cashed out now, counting up to
        the cent, one sentence on what that means, the one Request button
        (a popup lists what it covers and what happens next), and beside it
        where the money goes — the payout account on Stripe;
     3. what's left before a payout, when anything is (a ring and ticks);
     4. one switch, Money by sale | Payout history (?list=payouts):
        "Your share of each sale" (List ↔ Cards), where each sale's money
        is as a sentence with one way to act on it; or "Your payouts", tabs
        by state, then each payout on a timeline with its track and, when
        it waits on the account, the fix.
   No money yet: a hero with the four steps, then the account card.
   ?demo=loading|empty|error the branded states; ?demo=sample[&as=setup] a
   clickable sample that writes nothing. Words: lib/athlete-money-shop.ts.
   Styles: ../inventory/inventory.css + ./money.css.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const TITLE = "Payouts";
const HOME = "/athlete/money";
const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

/** `help`: "How money moves", the road in a popup — only once there is money to show on it. */
function Head({ lede = true, help }: { lede?: boolean; help?: ReactNode }) {
  return (
    <ArenaHead
      title={TITLE}
      pill={<ArenaUpdated />}
      actions={
        <span className="sx-my-head-actions">
          {help}
          <Link href="/athlete/sales" className="sx-iv-rules sx-my-sales">
            <MoneyGlyph name="tag" className="size-4" />
            Sales
            <MoneyGlyph name="arrow" className="size-3.5" />
          </Link>
        </span>
      }
    >
      {lede && (
        <p className="sx-iv-lede sx-iv-rise" style={d(0.04)}>
          Your share of every sale, where it is right now, and cashing it out to your bank.
        </p>
      )}
    </ArenaHead>
  );
}

/** A list route that may not be live yet: 404 → null (fall back to the blob); any other failure throws. */
async function pagedOrNull<T>(res: Response, path: string): Promise<T | null> {
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

type Read = {
  me: ApiMyPayouts;
  orders: ApiPayoutOrder[];
  ordersPage: PageInfo;
  payouts: ApiPayout[];
  historyPage: PageInfo;
  counts: Partial<Record<PayoutState, number>>;
  minor: boolean;
  sample: boolean;
};

export default async function MyMoneyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading" || demo === "error" || demo === "empty") {
    return (
      <div className="sx-iv sx-my space-y-8">
        <Head lede={demo !== "error"} />
        {demo === "loading" ? (
          <div className="sx-iv-list">
            <SkeletonRows rows={4} />
          </div>
        ) : demo === "error" ? (
          <ErrorPanel title="Payouts didn’t load" hint="The rest of the portal still works. Try again in a minute." />
        ) : (
          <FirstMoneyHero />
        )}
      </div>
    );
  }

  const sp = await searchParams;
  const state = historyState(sp[HISTORY_STATE_PARAM]);
  let read: Read;

  if (sp.demo === "sample") {
    /* ?demo=sample — a clickable sample: nothing is read for the money, nothing is written. */
    const me = sampleMoney(new Date(), sp.as === "setup" ? "setup" : "ready");
    const payouts = state ? me.payouts.filter((p) => p.state === state) : me.payouts;
    read = {
      me,
      orders: me.orders,
      ordersPage: pageOrAll(me.orders, undefined),
      payouts,
      historyPage: pageOrAll(payouts, undefined),
      counts: Object.fromEntries(Object.entries(me.byState ?? {}).map(([k, v]) => [k, v.count])),
      minor: false,
      sample: true,
    };
  } else {
    const ordersQuery = apiListQuery(sp, {});
    const historyQuery = apiListQueryFor(sp, HISTORY_KEYS, { state });
    const [res, ordRes, histRes, who] = await Promise.all([
      apiFetch("/payouts/me"),
      apiFetch(`/payouts/me/orders${ordersQuery}`).catch(() => null),
      apiFetch(`/payouts/me/history${historyQuery}`).catch(() => null),
      /* POL-FE-26 — a minor's own login (GET /me `guardianControl`) sees who sets the account up, never the Stripe button. */
      fetchActor(),
    ]);
    if (res.status === 403) {
      return (
        <div className="sx-iv sx-my space-y-6">
          <ArenaHead title={TITLE} />
          <EmptyState mark="inbox" title="Nothing to show for this login" hint="Payouts are the athlete's own. A parent or guardian follows it with the athlete." />
        </div>
      );
    }
    if (!res.ok) {
      return (
        <div className="sx-iv sx-my space-y-8">
          <Head lede={false} />
          <ErrorPanel title="Payouts didn’t load" hint="The rest of the portal still works. Try again in a minute." />
        </div>
      );
    }
    const me = (await res.json()) as ApiMyPayouts;
    const ordersList = ordRes ? await pagedOrNull<ApiMyPayoutOrders>(ordRes, "/payouts/me/orders") : null;
    const historyList = histRes ? await pagedOrNull<ApiMyPayoutHistory>(histRes, "/payouts/me/history") : null;
    /* The lists: the paged routes' pages — or, until they are live, the blob's own lists as one page. */
    const orders = ordersList?.orders ?? me.orders;
    const payouts = historyList?.payouts ?? (state ? me.payouts.filter((p) => p.state === state) : me.payouts);
    const counts: Partial<Record<PayoutState, number>> = historyList?.counts
      ?? (me.byState
        ? Object.fromEntries(Object.entries(me.byState).map(([k, v]) => [k, v.count]))
        : me.payouts.reduce<Partial<Record<PayoutState, number>>>((c, p) => ({ ...c, [p.state]: (c[p.state] ?? 0) + 1 }), {}));
    read = {
      me,
      orders,
      ordersPage: pageOrAll(orders, ordersList?.page),
      payouts,
      historyPage: pageOrAll(payouts, historyList?.page),
      counts,
      minor: who.status === "linked" && Boolean(who.actor.guardianControl) && !who.actor.actingFor,
      sample: false,
    };
  }

  const { me, orders, ordersPage, payouts, historyPage, counts, minor, sample } = read;
  const now = new Date();
  /* POL-FE-01 — after a guardian handoff or coming of age the account reads
     NOT_SET_UP while approved payouts wait for the new holder's own account. */
  const panel = accountPanel(me.account, me.payee.name, { minor, waiting: waitingPayouts(me) });
  const linkAction = sample ? moneySampleLinkAction : moneyAccountLinkAction.bind(null, HOME);
  const tabs = payoutTabs(counts, state);
  const anyPayout = (tabs[0]?.count ?? 0) > 0 || payouts.length > 0;
  const hasMoney = me.orders.length > 0 || ordersPage.total > 0;
  const unmet = me.checks.some((c) => !c.ok);
  const owedBack = owedBackNotice(me);
  const reserve = me.totals.heldCents > 0 ? `${usd(me.totals.heldCents)} stays in reserve and is paid when each order closes.` : null;

  return (
    <ServerList>
      <div className="sx-iv sx-my space-y-8">
        <Head help={hasMoney || anyPayout ? <MoneyRoadHelp stations={moneyStations(me)} sidings={moneySidings(me)} /> : undefined} />
        {sample && (
          <p className="sx-my-sample sx-iv-rise" style={d(0.02)}>
            <MoneyGlyph name="eye" className="size-3.5" />
            Sample page. The figures are made up and nothing you press is saved.
          </p>
        )}

        {!hasMoney && !anyPayout ? (
          <>
            <FirstMoneyHero setUp={panel.actionNeeded && !panel.guardianOnly} />
            <div className="sx-my-solo">
              <AccountCard panel={panel} action={linkAction} />
            </div>
          </>
        ) : (
          <>
            <CashOut
              board={cashBoard(me)}
              orders={requestOrders(me.orders)}
              note={reserve}
              action={moneyRequestAction}
              panel={panel}
              linkAction={linkAction}
              sample={sample}
            />

            {owedBack && (
              <p role="status" className="sx-my-owed sx-iv-rise" style={d(0.08)}>
                <MoneyGlyph name="undo" className="size-4" />
                <span>
                  <strong>{owedBack}.</strong> A sponsor was refunded after your share was paid out. It comes off your next payout; the sale is marked below.
                </span>
              </p>
            )}

            {hasMoney && unmet && <MoneyChecklist checks={me.checks} canRequest={me.canRequest} panel={panel} linkAction={linkAction} />}

            <MoneyTabs
              initial={sp.list === "payouts" || sp[HISTORY_STATE_PARAM] || sp[HISTORY_KEYS.page] || sp[HISTORY_KEYS.size] ? "payouts" : "sales"}
              salesCount={ordersPage.total}
              payoutsCount={tabs[0]?.count ?? historyPage.total}
              ready={me.canRequest && me.totals.requestableCents > 0}
              orders={{ cards: orders.map((o) => orderMoneyCard(o, now)), page: ordersPage }}
              payouts={{
                payouts: payouts.map((p) => payoutCard(p, `${HOME}#payout-account`)),
                tabs,
                tab: state || "all",
                page: historyPage,
                keys: HISTORY_KEYS,
                filtered: state !== "",
              }}
            />
          </>
        )}
      </div>
    </ServerList>
  );
}
