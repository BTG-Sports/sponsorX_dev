import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { RemindSellerButton } from "@/components/delivery-issue-decision";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { apiListQuery } from "@/lib/list-query";
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

   P1-FE-31 (2026-10-07): one SERVER-PAGED table per tab — the API answers
   the open tab's page and every tab's count (it used to send all three
   lists whole).

   Reads  GET  /delivery-issues?tab=problems|settled|overdue&page&size   { counts, page, <tab>: [...] }
   Writes POST /delivery-issues/:lineId/remind  (RemindSellerButton → ./actions.ts)
   BTG admins only (orderDelivery approve); ?demo=loading|empty|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/delivery-issues";
const TITLE = "Delivery issues";

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
  const sp = await searchParams;
  const tab = deliveryTab(sp.tab);
  const empty = demo === "empty";
  const res = empty ? null : await apiFetch(`/delivery-issues${apiListQuery(sp, { tab: tab.key })}`);
  if (res && !res.ok) throw new Error(`Delivery issues unavailable (${res.status}).`);
  const desk: ApiDeliveryDesk = res ? ((await res.json()) as ApiDeliveryDesk) : { confirmWindowHours: 24 };
  const counts = desk.counts ?? { problems: desk.problems?.length ?? 0, settled: desk.settled?.length ?? 0, overdue: desk.overdue?.length ?? 0 };
  const problems = desk.problems ?? [];
  const settled = desk.settled ?? [];
  const overdue = desk.overdue ?? [];
  const shown = tab.key === "problems" ? problems.length : tab.key === "settled" ? settled.length : overdue.length;
  const page = desk.page ?? { page: 1, size: shown || 12, total: shown, pages: 1 };
  const none = DESK_EMPTY[tab.key];

  const columns: Column[] = [
    { key: "order", label: "Order" },
    { key: "seller", label: "Seller" },
    { key: "sponsor", label: "Sponsor" },
    { key: "reason", label: tab.key === "problems" ? "Why it needs you" : "Status" },
    { key: "when", label: "When" },
    { key: "action", label: "Action", srOnly: true },
  ];
  const order = (r: ApiDeliveryIssue) => (
    <Primary sub={`${r.line} · ${r.quantity}${isCancellation(r) ? " · cancellation" : ""}`}>{r.orderRef}</Primary>
  );
  const reason = (p: Pill & { sub: string }) => (
    <span className="block min-w-0">
      <StatePill p={p} />
      <span className="mt-1 block text-[11px] text-muted">{p.sub}</span>
    </span>
  );
  const link = "inline-flex min-h-9 items-center justify-center rounded-lg px-3.5 text-xs font-semibold";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">{DESK_RULE}</p>
      </div>

      <TabStrip label="Delivery issues">
        {DELIVERY_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={counts[t.key]} hot={t.key !== "settled"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {shown === 0 ? (
        <EmptyState mark={tab.key === "overdue" ? "clock" : "inbox"} title={none.title} hint={none.hint} />
      ) : tab.key === "problems" ? (
        <PagedTable page={page} noun="Issues" label="Needs BTG" columns={columns}>
          {problems.map((p, i) => (
            <Tr key={p.id} i={i} tone="danger">
              <Td>{order(p)}</Td>
              <Td label="Seller">{p.seller.name}{p.seller.sub && <span className="block text-[11px] text-muted">{p.seller.sub}</span>}</Td>
              <Td label="Sponsor">{p.sponsor.name}</Td>
              <Td label="Why">{reason(deskReason(p))}</Td>
              <Td label="When" muted>{p.escalation ? momentOf(p.escalation.at) : "—"}</Td>
              <Td act>
                <Link href={`${PATH}/${p.id}`} aria-label={`Decide ${p.orderRef}`} className={`${link} bg-primary text-cta-ink hover:bg-primary-soft`}>
                  Decide →
                </Link>
              </Td>
            </Tr>
          ))}
        </PagedTable>
      ) : tab.key === "settled" ? (
        <PagedTable page={page} noun="Issues" label="Settled between them" columns={columns}>
          {settled.map((p, i) => (
            <Tr key={p.settlement.issueId} i={i}>
              <Td>{order(p)}</Td>
              <Td label="Seller">{p.seller.name}{p.seller.sub && <span className="block text-[11px] text-muted">{p.seller.sub}</span>}</Td>
              <Td label="Sponsor">{p.sponsor.name}</Td>
              <Td label="Status">{reason(settledBadge(p))}</Td>
              <Td label="Settled" muted>{p.settlement.at ? dayOf(p.settlement.at) : "—"}</Td>
              <Td act>
                <Link href={`${PATH}/${p.id}`} aria-label={`View ${p.orderRef}`} className={`${link} border border-line text-text hover:bg-surface-2`}>
                  View
                </Link>
              </Td>
            </Tr>
          ))}
        </PagedTable>
      ) : (
        <PagedTable
          page={page}
          noun="Lines"
          label="Overdue delivery"
          columns={columns}
          foot={
            <p className="text-[11px] text-faint">
              Sellers are reminded the day after a line&rsquo;s last date and again 3 days after it; &ldquo;Remind again&rdquo; emails them once more, at most once a day.
              After {OVERDUE_HANDOVER_DAYS} days with nothing marked, the line moves to Needs BTG.
            </p>
          }
        >
          {overdue.map((o, i) => {
            const st = overdueState(o);
            return (
              <Tr key={o.id} i={i} tone="warn">
                <Td>{order(o)}</Td>
                <Td label="Seller">{o.seller.name}{o.seller.sub && <span className="block text-[11px] text-muted">{o.seller.sub}</span>}</Td>
                <Td label="Sponsor">{o.sponsor.name}</Td>
                <Td label="Status">{reason(st)}</Td>
                <Td label="Last date" muted>{dayOf(o.redeliverOn ?? o.lastDate)} has passed</Td>
                <Td act>
                  <RemindSellerButton lineId={o.id} seller={o.seller.name} label={st.button} />
                </Td>
              </Tr>
            );
          })}
        </PagedTable>
      )}
    </div>
  );
}
