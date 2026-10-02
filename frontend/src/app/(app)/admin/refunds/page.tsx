import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { MarkRefunded } from "@/components/refunds-desk";
import { StatePill } from "@/components/order-bits";
import { Card } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { money } from "@/lib/order-automation-live";
import {
  REFUND_TABS, causeLabel, openSummary, refundTab, refundWhat, sentWords, waitingSince,
  type ApiRefund, type ApiRefundList,
} from "@/lib/refunds-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Refunds to send — 2S4-FE-06 (Claude Design OrderCancellations.dc.html,
   CX-11 to send · CX-12 Mark refunded · CX-13 sent · CX-14 empty). Until a
   payment provider is connected, money goes back by hand: every refund of a
   paid order — a cancellation, a settled problem, BTG's decision — leaves
   one row here (2S4-BE-13). A card refunded by the stand-in arrives already
   sent, "Refunded automatically (test provider)".

   Reads  GET  /refunds?state=OPEN|SENT   { counts, openCents, refunds }
   Writes POST /refunds/:id/sent          (MarkRefunded → ./actions.ts)
   BTG admin and Finance only (refundDue); anyone else gets "Not in your
   role". ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/refunds";
const TITLE = "Refunds to send";
const COLS = "xl:grid-cols-[7.5rem_minmax(0,1fr)_minmax(0,1.4fr)_6rem_minmax(10rem,1.2fr)_6.5rem_minmax(0,1fr)_8rem]";

export default async function RefundsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const tab = refundTab((await searchParams).tab);
  const empty = demo === "empty";
  const res = empty ? null : await apiFetch(`/refunds?state=${tab.state}`);
  if (res?.status === 403) return <NotInRole path={PATH} title={TITLE} roles={["BTG_ADMIN", "FINANCE"]} />;
  if (res && !res.ok) throw new Error(`Refunds unavailable (${res.status}).`);
  const list: ApiRefundList = res ? ((await res.json()) as ApiRefundList) : { counts: { open: 0, sent: 0 }, openCents: 0, refunds: [] };
  const rows = list.refunds;
  const counts = { tosend: list.counts.open, sent: list.counts.sent };
  const sent = tab.key === "sent";
  const shownOf = counts[tab.key] > rows.length ? `Showing ${rows.length} of ${counts[tab.key]} ${sent ? "sent refunds" : "refunds to send"}.` : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          Money owed back to sponsors, sent by hand for now. Card payments are refunded automatically once the payment provider is connected.
        </p>
        {list.counts.open > 0 && <p className="mt-2 text-sm font-semibold tabular-nums">{openSummary(list)}</p>}
      </div>

      <nav aria-label="Refunds" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 sm:w-fit">
        {REFUND_TABS.map((t) => {
          const on = t.key === tab.key;
          const n = counts[t.key];
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}>
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${t.key === "tosend" && n ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        sent
          ? <EmptyState mark="inbox" title="Nothing sent yet" hint="Refunds marked sent — by Finance, or automatically to a card — appear here." />
          : <EmptyState mark="inbox" title="Nothing to send" hint="Nothing to send — every refund is out." />
      ) : (
        <Card className="overflow-hidden p-0">
          <div role="region" aria-label={sent ? "Sent refunds" : "Refunds to send"}>
            <div className={`hidden gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint xl:grid ${COLS}`}>
              <span>Order</span><span>Sponsor</span><span>Line</span><span className="text-right">Amount</span><span>Why</span><span>Paid by</span>
              <span>{sent ? "Sent" : "Waiting since"}</span><span className="sr-only">Action</span>
            </div>
            <ul className="divide-y divide-line-soft">
              {rows.map((r) => <RefundRow key={r.id} r={r} sent={sent} />)}
            </ul>
            {shownOf && <p className="border-t border-line-soft px-4 py-2.5 text-[11px] text-faint">{shownOf}</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

function RefundRow({ r, sent }: { r: ApiRefund; sent: boolean }) {
  const when = sent ? sentWords(r) ?? "Sent" : waitingSince(r.createdAt);
  const why = <span title={r.causeWords}><StatePill p={{ label: causeLabel(r.cause), tone: "primary", mark: "●" }} /></span>;
  return (
    <li className={`grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs xl:items-start ${COLS}`}>
      <span className="flex items-baseline justify-between gap-3 xl:block">
        <strong className="text-[13px] font-semibold">{r.orderRef}</strong>
        <strong className="text-sm tabular-nums xl:hidden">{money(r.amountCents)}</strong>
      </span>
      <span className="hidden xl:block">{r.sponsor.name}</span>
      <span className="min-w-0">
        <span className="text-text/85 xl:hidden">{r.sponsor.name} · </span>
        {refundWhat(r)}
      </span>
      <span className="hidden text-right font-semibold tabular-nums xl:block">{money(r.amountCents)}</span>
      <span className="min-w-0">
        {why}
        <span className="mt-1 block text-[11px] text-muted">{r.causeWords}</span>
      </span>
      <span className="text-muted xl:text-text">
        <span className="xl:hidden">Paid by </span>{r.paidViaWords ?? "—"}
      </span>
      <span className="text-muted">
        {when}
        {!sent && r.zohoNote && <span className="mt-1 block text-[11px] text-primary-soft">{r.zohoNote}</span>}
      </span>
      <span className="pt-1 xl:pt-0 xl:text-right">
        {!sent && <MarkRefunded refund={r} />}
      </span>
    </li>
  );
}
