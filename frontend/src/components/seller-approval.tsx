import Link from "next/link";

import { Card } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { SellerApprovalAnswer } from "@/components/seller-approval-answer";
import { DeadlineChip, DeliveryTrack, StatePill, StatusBox } from "@/components/order-bits";
import {
  approvalAsk, approvalBadge, approvalOutcome, approvalTrack, datesText, deadline, lineDays, money,
  type ApiSellerApproval,
} from "@/lib/order-automation-live";
import { SELLER, type SellerKind } from "@/lib/seller-orders-live";

/* --------------------------------------------------------------------------
   2S4-FE-05 — an order the seller's listing asks them to approve
   (SellerOrderActions.dc.html, who = riley | hawks; views approve · accept ·
   decline · accepted · declined · expired). Shared by
   /athlete/sales/approvals/[id] and /property/sales/approvals/[id] — the
   links the approval emails carry — and, as a list, the top of the Orders
   page.

   Reads  GET /seller-approvals, GET /seller-approvals/:id (2S4-BE-09) —
          only the lines the seller is asked about and the sponsor's name,
          never the order's total or another seller's lines
   Writes POST /seller-approvals/:id/decision (SellerApprovalAnswer)

   No share is shown here: it is booked only once the order is approved, so
   the card shows the line's value instead of the design's "Your share".
   -------------------------------------------------------------------------- */

const approvalPath = (kind: SellerKind, id: string) => `${SELLER[kind].basePath}/approvals/${id}`;

/** The Orders page's "Waiting for your approval" list — every approval not yet a sale. */
export function SellerApprovalsPanel({ kind, approvals, now }: { kind: SellerKind; approvals: ApiSellerApproval[]; now: Date }) {
  if (!approvals.length) return null;
  const open = approvals.filter((a) => a.canAnswer).length;
  return (
    <section aria-label="Orders to approve" className="space-y-2">
      <h2 className="text-sm font-semibold tracking-tight">
        {open ? `Waiting for your approval · ${open}` : "Orders you were asked to approve"}
      </h2>
      <Card className="p-0">
        <ul className="divide-y divide-line-soft">
          {approvals.map((a) => {
            const d = a.canAnswer ? deadline("Answer by", a.dueAt, now) : null;
            return (
              <li key={a.id} className="flex flex-col gap-2 px-4 py-3.5 text-xs sm:flex-row sm:items-start sm:justify-between">
                <span className="min-w-0 space-y-1.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-semibold">{a.orderRef}</strong>
                    <StatePill p={approvalBadge(a)} />
                  </span>
                  <span className="block text-[13px] leading-relaxed">{approvalAsk(a)}</span>
                  {d && <DeadlineChip d={d} />}
                </span>
                <Link
                  href={approvalPath(kind, a.id)}
                  aria-label={`${a.canAnswer ? "Answer" : "Open"} order ${a.orderRef}`}
                  className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-4 text-sm font-semibold sm:min-h-9 sm:text-xs ${a.canAnswer ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"}`}
                >
                  {a.canAnswer ? "Answer →" : "Open →"}
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

/** One approval: the ask, the 48 hours, Accept / Decline — or what came of the answer. */
export function SellerApprovalDetail({ kind, approval: a, now }: { kind: SellerKind; approval: ApiSellerApproval; now: Date }) {
  const s = a.sponsorName;
  const outcome = approvalOutcome(a);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-xs text-muted">Every sale of your items. You see your own share only.</p>
      </div>
      <div className="space-y-4">
        <Link href={SELLER[kind].basePath} className="text-xs text-muted hover:text-text">← Orders</Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg font-semibold tracking-tight">Order {a.orderRef}</h2>
          <StatePill p={approvalBadge(a)} />
        </div>

        {a.canAnswer && (
          <section aria-label="Approve this order" className="flex flex-col gap-3 rounded-xl border border-warn/50 bg-surface p-4 sm:p-5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-warn">Your listing needs your approval</p>
            <h3 className="text-[17px] font-semibold leading-snug">{approvalAsk(a)}</h3>
            <p className="text-[13px]">
              Order value: <strong className="text-base tabular-nums">{money(a.totalCents)}</strong>
            </p>
            <DeadlineChip d={deadline("Answer by", a.dueAt, now)} after="If you don’t answer, the order is declined." />
            <SellerApprovalAnswer id={a.id} sponsor={s} lines={a.lines} />
          </section>
        )}

        {outcome && <StatusBox tone={outcome.tone} title={outcome.title} text={outcome.text} quote={outcome.quote} />}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section aria-label="Order lines" className="min-w-0 space-y-3">
            {a.lines.map((l) => (
              <Card key={l.id}>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="min-w-[12rem] flex-1">
                    <strong className="block text-sm font-semibold">{l.title}</strong>
                    <span className="text-xs text-muted">
                      {l.quantity} × {money(l.unitPriceCents)} · {datesText(lineDays(l))}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[11px] text-muted">Line value</span>
                    <strong className="text-lg tabular-nums">{money(l.lineTotalCents)}</strong>
                  </span>
                </div>
                <DeliveryTrack steps={approvalTrack(a)} label="Order progress" />
              </Card>
            ))}
          </section>
          <aside aria-label="Sponsor">
            <Card className="space-y-2.5">
              <h2 className="text-sm font-semibold">Sponsor</h2>
              <p className="text-[15px] font-semibold">{s}</p>
              <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-xs leading-relaxed text-text/85">
                Contact details appear once {s} has paid.
              </p>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** An approval id that isn't the caller's. */
export function SellerApprovalMissing({ kind }: { kind: SellerKind }) {
  return (
    <div className="space-y-6">
      <Link href={SELLER[kind].basePath} className="text-xs text-muted hover:text-text">← Orders</Link>
      <EmptyState mark="inbox" title="No order matches this link" hint="It may be for another seller, or the link is wrong." action={{ label: "Your orders", href: SELLER[kind].basePath }} />
    </div>
  );
}
