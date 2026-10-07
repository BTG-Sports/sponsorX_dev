import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { MarkRefunded } from "@/components/refunds-desk";
import { StatePill } from "@/components/order-bits";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { apiListQuery } from "@/lib/list-query";
import { money } from "@/lib/order-automation-live";
import {
  REFUND_TABS, causeLabel, openSummary, refundRef, refundTab, refundWhat, sentWords, waitingSince,
  type ApiRefundList,
} from "@/lib/refunds-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Refunds to send — 2S4-FE-06 (Claude Design OrderCancellations.dc.html,
   CX-11 to send · CX-12 Mark refunded · CX-13 sent · CX-14 empty). Until a
   payment provider is connected, money goes back by hand: every refund of a
   paid order — a cancellation, a settled problem, BTG's decision — leaves
   one row here (2S4-BE-13). A card refunded by the stand-in arrives already
   sent, "Refunded automatically (test provider)".

   P1-FE-31 (2026-10-07): one SERVER-PAGED table per tab (the house pager).

   Reads  GET  /refunds?state=OPEN|SENT&page&size   { counts, openCents, refunds, page }
   Writes POST /refunds/:id/sent                    (MarkRefunded → ./actions.ts)
   BTG admin and Finance only (refundDue); anyone else gets "Not in your
   role". ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/refunds";
const TITLE = "Refunds to send";

export default async function RefundsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const tab = refundTab(sp.tab);
  const empty = demo === "empty";
  const res = empty ? null : await apiFetch(`/refunds${apiListQuery(sp, { state: tab.state })}`);
  if (res?.status === 403) return <NotInRole path={PATH} title={TITLE} roles={["BTG_ADMIN", "FINANCE"]} />;
  if (res && !res.ok) throw new Error(`Refunds unavailable (${res.status}).`);
  const list: ApiRefundList = res ? ((await res.json()) as ApiRefundList) : { counts: { open: 0, sent: 0 }, openCents: 0, refunds: [] };
  const rows = list.refunds;
  const page = list.page ?? { page: 1, size: rows.length || 12, total: rows.length, pages: 1 };
  const counts = { tosend: list.counts.open, sent: list.counts.sent };
  const sent = tab.key === "sent";

  const columns: Column[] = [
    { key: "order", label: "Order" },
    { key: "sponsor", label: "Sponsor" },
    { key: "line", label: "Line" },
    { key: "amount", label: "Amount", num: true },
    { key: "why", label: "Why" },
    { key: "paid", label: "Paid by" },
    { key: "when", label: sent ? "Sent" : "Waiting since" },
    ...(sent ? [] : [{ key: "action", label: "Action", srOnly: true }]),
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          Money owed back to sponsors, sent by hand for now. Card payments are refunded automatically once the payment provider is connected.
        </p>
        {list.counts.open > 0 && <p className="mt-2 text-sm font-semibold tabular-nums">{openSummary(list)}</p>}
      </div>

      <TabStrip label="Refunds">
        {REFUND_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={counts[t.key]} hot={t.key === "tosend"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {rows.length === 0 ? (
        sent
          ? <EmptyState mark="inbox" title="Nothing sent yet" hint="Refunds marked sent — by Finance, or automatically to a card — appear here." />
          : <EmptyState mark="inbox" title="Nothing to send" hint="Nothing to send — every refund is out." />
      ) : (
        <PagedTable page={page} noun="Refunds" label={sent ? "Sent refunds" : "Refunds to send"} columns={columns}>
          {rows.map((r, i) => (
            <Tr key={r.id} i={i} tone={sent ? undefined : "warn"}>
              <Td><Primary>{refundRef(r)}</Primary></Td>
              <Td label="Sponsor">{r.sponsor.name}</Td>
              <Td label="Line" muted>{refundWhat(r)}</Td>
              <Td label="Amount" num className="font-semibold">{money(r.amountCents)}</Td>
              <Td label="Why">
                <span title={r.causeWords}><StatePill p={{ label: causeLabel(r.cause), tone: "primary", mark: "●" }} /></span>
                <span className="mt-1 block text-[11px] text-muted">{r.causeWords}</span>
              </Td>
              <Td label="Paid by">{r.paidViaWords ?? "—"}</Td>
              <Td label={sent ? "Sent" : "Waiting since"} muted>
                {sent ? sentWords(r) ?? "Sent" : waitingSince(r.createdAt)}
                {!sent && r.zohoNote && <span className="mt-1 block text-[11px] text-primary-soft">{r.zohoNote}</span>}
              </Td>
              {!sent && (
                <Td act>
                  <MarkRefunded refund={r} />
                </Td>
              )}
            </Tr>
          ))}
        </PagedTable>
      )}
    </div>
  );
}
