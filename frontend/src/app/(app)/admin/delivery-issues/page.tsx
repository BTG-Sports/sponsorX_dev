import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { RemindSellerButton } from "@/components/delivery-issue-decision";
import { Card } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { StatePill } from "@/components/order-bits";
import { DELIVERY_TABS, DESK_RULE, dayOf, deliveryTab, isCancellation, type ApiDeliveryDesk, type ApiDeliveryIssue } from "@/lib/delivery-issues-live";
import { DESK_EMPTY, OVERDUE_HANDOVER_DAYS, deskReason, momentOf, overdueState, settledBadge, type Pill } from "@/lib/order-automation-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Delivery issues — 2S4-FE-04 / 2S4-FE-05, BTG half (Claude Design
   OrderExceptions.dc.html, views needs · settled · overdue · empty).
   Deliveries confirm themselves, and since 2S4-BE-11 a reported problem is
   settled between the seller and the sponsor: BTG sees only what they
   couldn't settle, or where someone didn't answer — plus, read-only, what
   they settled, and lines still overdue.

   2S4-FE-06 (OrderCancellations.dc.html, CX-9a): a sponsor's request to
   cancel that the seller declined or didn't answer lands in Needs BTG too,
   marked "cancellation", with the API's own words for why it came.

   Reads  GET  /delivery-issues                 { problems, settled, overdue }
   Writes POST /delivery-issues/:lineId/remind  (RemindSellerButton → ./actions.ts)
   BTG admins only (orderDelivery approve); ?demo=loading|empty|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/delivery-issues";
const TITLE = "Delivery issues";
const COLS = "md:grid-cols-[1.5fr_9rem_8rem_1.6fr_7rem_7rem]";

export default async function DeliveryIssuesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const tab = deliveryTab((await searchParams).tab);
  const empty = demo === "empty";
  const res = empty ? null : await apiFetch("/delivery-issues");
  if (res && !res.ok) throw new Error(`Delivery issues unavailable (${res.status}).`);
  const desk: ApiDeliveryDesk = res ? ((await res.json()) as ApiDeliveryDesk) : { confirmWindowHours: 24, problems: [], settled: [], overdue: [] };
  const problems = desk.problems;
  const settled = desk.settled ?? [];
  const overdue = desk.overdue;
  const counts = { problems: problems.length, settled: settled.length, overdue: overdue.length };
  const none = DESK_EMPTY[tab.key];

  const head = (reason: string) => (
    <div className={`hidden gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid ${COLS}`}>
      <span>Order</span><span>Seller</span><span>Sponsor</span><span>{reason}</span><span>When</span><span className="sr-only">Action</span>
    </div>
  );
  const parties = (r: ApiDeliveryIssue) => (
    <>
      <span><span className="text-muted md:hidden">Seller: </span>{r.seller.name}{r.seller.sub && <span className="block text-[11px] text-muted">{r.seller.sub}</span>}</span>
      <span><span className="text-muted md:hidden">Sponsor: </span>{r.sponsor.name}</span>
    </>
  );
  const order = (r: ApiDeliveryIssue) => (
    <span className="min-w-0">
      <strong className="block text-[13px] font-semibold">{r.orderRef}</strong>
      <span className="block text-[11px] text-muted">{r.line} · {r.quantity}{isCancellation(r) ? " · cancellation" : ""}</span>
    </span>
  );
  const reason = (p: Pill & { sub: string }) => (
    <span className="min-w-0">
      <StatePill p={p} />
      <span className="mt-1 block text-[11px] text-muted">{p.sub}</span>
    </span>
  );
  const link = "inline-flex min-h-11 w-full items-center justify-center rounded-lg px-3.5 text-xs font-semibold md:min-h-9 md:w-auto";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">{DESK_RULE}</p>
      </div>

      <nav aria-label="Delivery issues" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 sm:w-fit">
        {DELIVERY_TABS.map((t) => {
          const on = t.key === tab.key;
          const n = counts[t.key];
          const tone = t.key === "problems" ? "bg-danger/15 text-danger" : t.key === "overdue" ? "bg-warn/15 text-warn" : "bg-surface-2";
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}>
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${n ? tone : "bg-surface-2"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {counts[tab.key] === 0 ? (
        <EmptyState mark={tab.key === "overdue" ? "clock" : "inbox"} title={none.title} hint={none.hint} />
      ) : tab.key === "problems" ? (
        <Card className="overflow-hidden p-0">
          <div role="region" aria-label="Needs BTG">
            {head("Why it needs you")}
            <ul className="divide-y divide-line-soft">
              {problems.map((p) => (
                <li key={p.id} className={`grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs md:items-start ${COLS}`}>
                  {order(p)}
                  {parties(p)}
                  {reason(deskReason(p))}
                  <span className="text-muted">{p.escalation ? momentOf(p.escalation.at) : "—"}</span>
                  <span className="md:text-right">
                    <Link href={`${PATH}/${p.id}`} aria-label={`Decide ${p.orderRef}`} className={`${link} bg-primary text-cta-ink hover:bg-primary-soft`}>
                      Decide →
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : tab.key === "settled" ? (
        <Card className="overflow-hidden p-0">
          <div role="region" aria-label="Settled between them">
            {head("Status")}
            <ul className="divide-y divide-line-soft">
              {settled.map((p) => (
                <li key={p.settlement.issueId} className={`grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs md:items-start ${COLS}`}>
                  {order(p)}
                  {parties(p)}
                  {reason(settledBadge(p))}
                  <span className="text-muted">{p.settlement.at ? dayOf(p.settlement.at) : "—"}</span>
                  <span className="md:text-right">
                    <Link href={`${PATH}/${p.id}`} aria-label={`View ${p.orderRef}`} className={`${link} border border-line text-text hover:bg-surface-2`}>
                      View
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : (
        <div className="space-y-2.5">
          <Card className="overflow-hidden p-0">
            <div role="region" aria-label="Overdue delivery">
              {head("Status")}
              <ul className="divide-y divide-line-soft">
                {overdue.map((o) => {
                  const st = overdueState(o);
                  return (
                    <li key={o.id} className={`grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs md:items-start ${COLS}`}>
                      {order(o)}
                      {parties(o)}
                      {reason(st)}
                      <span className="text-muted">{dayOf(o.redeliverOn ?? o.lastDate)} has passed</span>
                      <span className="md:text-right">
                        <RemindSellerButton lineId={o.id} seller={o.seller.name} label={st.button} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>
          <p className="text-[11px] text-faint">
            Sellers are reminded the day after a line&rsquo;s last date and again 3 days after it; &ldquo;Remind again&rdquo; emails them once more, at most once a day.
            After {OVERDUE_HANDOVER_DAYS} days with nothing marked, the line moves to Needs BTG.
          </p>
        </div>
      )}
    </div>
  );
}
