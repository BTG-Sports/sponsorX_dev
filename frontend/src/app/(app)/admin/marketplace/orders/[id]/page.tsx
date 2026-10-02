import Link from "next/link";

import { MopsOrderActions } from "@/components/mops-order-actions";
import { HeldOrderDecision } from "@/components/mops-held-order";
import { SpendingLimitCard } from "@/components/mops-spending-limit";
import { money, type ApiSpendingLimit } from "@/lib/order-automation-live";
import { OrderGateRecordCard } from "@/components/order-gate-record";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { EmptyState } from "@/components/states";
import { Badge, Card, SectionHeading } from "@/components/ui";
import {
  ORDER_STATE_COPY,
  shortId,
  splitRows,
  usd,
  waitLabel,
  type ApiLineFinancials,
  type ApiMarketplaceOrder,
} from "@/lib/marketplace-ops-live";
import type { OrderGateRecord } from "@/lib/checkout-gate";
import { dateLabel } from "@/lib/onboarding-live";
import { paymentView, type ApiOrderPayment } from "@/lib/order-payment-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   One marketplace order — 2S7-FE-02. Its lines, why policy held it, the
   frozen split per line, what BTG can do next, and (2S4-FE-02) the billing
   contact and order-terms acceptance the sponsor gave at checkout.

   Reads GET /marketplace-orders/:id and GET /marketplace-orders/:id/financials
   (the split is written at contract time — before approval there is none).
   Writes POST …/decision (APPROVE / REJECT with a note) while PENDING_APPROVAL,
   and POST …/transition for the staff moves the state allows afterwards.
   The API answers an unknown id with 403; for a reviewer who holds the role
   that reads as "no such order".

   2S4-FE-05 (OrderExceptions.dc.html, views limit · approveHeld ·
   rejectHeld · markPaid): GET /sponsors/:sponsorId/spending-limit gives the
   sponsor's name and limit card; an order held above it gets the Held order
   card (Approve / Reject → POST …/decision), and Mark paid by hand is the
   design's dialog (POST …/transition {to: PAID, payment}).

   Honest gap: a role that can't read the sponsor's limit sees the sponsor
   only by id.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/admin/marketplace";

export default async function MarketplaceOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Marketplace operations" roles={lacking} />;

  const { id } = await params;
  const [res, finRes, payRes] = await Promise.all([
    apiFetch(`/marketplace-orders/${encodeURIComponent(id)}`),
    apiFetch(`/marketplace-orders/${encodeURIComponent(id)}/financials`),
    /* 2S5-INT-01 — how the sponsor's card payment stands (BTG reads it too). */
    apiFetch(`/marketplace-orders/${encodeURIComponent(id)}/payment`),
  ]);
  const payment = payRes.ok ? ((await payRes.json()) as ApiOrderPayment) : null;
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-5">
        <Link href={PATH} className="text-xs text-muted hover:text-text">
          ← Marketplace operations
        </Link>
        <EmptyState mark="inbox" title="No order matches this link" hint="It may belong to another tenant, or the address is incomplete." action={{ label: "Back to the console", href: PATH }} />
      </div>
    );
  }
  if (!res.ok) throw new Error(`The order didn't load (${res.status}).`);
  if (!finRes.ok && finRes.status !== 403) throw new Error(`The order's split didn't load (${finRes.status}).`);
  const order = (await res.json()) as ApiMarketplaceOrder & OrderGateRecord;
  /* 2S4-BE-09 — the sponsor's spending limit (BTG); a failed read hides the card, never the page. */
  const limitRes = await apiFetch(`/sponsors/${encodeURIComponent(order.sponsorId)}/spending-limit`).catch(() => null);
  const limit = limitRes?.ok ? ((await limitRes.json()) as ApiSpendingLimit) : null;
  const held = order.state === "PENDING_APPROVAL";
  const above = limit !== null && order.totalCents > limit.limitCents;
  const financials: ApiLineFinancials[] | null = finRes.ok ? ((await finRes.json()) as { lines: ApiLineFinancials[] }).lines : null;
  const state = ORDER_STATE_COPY[order.state];
  const byLine = new Map((financials ?? []).map((f) => [f.lineId, f]));
  const wait = order.state === "PENDING_APPROVAL" ? waitLabel(order.createdAt, new Date().getTime()) : null;

  return (
    <div className="space-y-6">
      <Link href={PATH} className="text-xs text-muted hover:text-text">
        ← Marketplace operations
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Order {shortId(order.id)}</h1>
          <p className="mt-1 text-xs text-muted">
            Placed {dateLabel(order.createdAt)}
            {wait ? ` · waiting ${wait}` : ""} · sponsor{" "}
            {limit ? <strong className="font-medium text-text">{limit.sponsorName}</strong> : <code className="text-[11px]">{order.sponsorId}</code>}
          </p>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {held && (
            <section aria-label="Held order" className="flex flex-col gap-2.5 rounded-xl border border-warn/50 bg-surface p-4 sm:p-5">
              <h2 className="text-sm font-semibold">Held order</h2>
              <p className="text-sm font-semibold">
                {shortId(order.id)} · {money(order.totalCents)} · {above ? "above the limit — waiting for you" : "waiting for you"}
              </p>
              {order.lines[0] && (
                <p className="text-xs leading-relaxed text-muted">
                  {order.lines[0].title}{order.lines.length > 1 ? ` and ${order.lines.length - 1} more` : ""}
                </p>
              )}
              <HeldOrderDecision id={order.id} orderRef={shortId(order.id)} totalCents={order.totalCents} limit={limit} />
            </section>
          )}
          {order.approvalReasons.length > 0 && (
            <Card className="border-warn/30">
              <SectionHeading title="Why it needs approval" hint="The approval policy's own reasons — orders within the sponsor's spending limit are approved on their own." />
              <ul className="list-disc space-y-1 pl-4 text-sm">
                {order.approvalReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-0">
            <div className="px-5 pt-4">
              <SectionHeading title="Lines" />
            </div>
            <ul className="divide-y divide-line-soft">
              {order.lines.map((l) => (
                <li key={l.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{l.title}</p>
                    <p className="text-[11px] text-muted">
                      {l.quantity} × {usd(l.unitPriceCents)} · {dateLabel(l.startsOn)} – {dateLabel(l.endsOn)}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular-nums">{usd(l.lineTotalCents)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-line px-5 py-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="tabular-nums">{usd(order.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Fees</dt>
                <dd className="tabular-nums">{usd(order.feesCents)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{usd(order.totalCents)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <SectionHeading title="Split per line" hint="Frozen when the order is contracted (approved). Every figure is the API's." />
            {financials === null ? (
              <p className="text-xs text-muted">Your role can&rsquo;t read the split.</p>
            ) : financials.length === 0 ? (
              <p className="text-xs text-muted">
                {order.contractedAt ? "No split was recorded for this order." : "No split yet — it is computed and frozen when the order is approved."}
              </p>
            ) : (
              <div className="space-y-5">
                {order.lines.map((l) => {
                  const f = byLine.get(l.id);
                  if (!f) return null;
                  return (
                    <div key={l.id}>
                      <p className="text-xs font-medium">{l.title}</p>
                      <dl className="mt-1 divide-y divide-line-soft text-xs">
                        {splitRows(f).map((r, i) => (
                          <div key={`${i}-${r.label}`} className={`flex justify-between py-1 ${r.sub ? "pl-4 text-muted" : ""}`}>
                            <dt>{r.label}</dt>
                            <dd className="tabular-nums">{usd(r.cents)}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-1 text-[10px] text-faint">Computed {dateLabel(f.computedAt)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <SectionHeading title="Actions" hint="Recorded against your account in the audit log." />
            <MopsOrderActions key={order.state} id={order.id} state={order.state} orderRef={shortId(order.id)} totalCents={order.totalCents} />
          </Card>
          {limit && <SpendingLimitCard limit={limit} />}
          <OrderGateRecordCard order={order} />
          {(order.decidedAt || order.decisionNotes) && (
            <Card>
              <SectionHeading title="Decision" />
              <p className="text-xs text-muted">
                {dateLabel(order.decidedAt)}
                {order.decidedBy === "system" ? " · approved by policy" : ""}
              </p>
              {order.decisionNotes && <p className="mt-2 whitespace-pre-wrap text-sm">&ldquo;{order.decisionNotes}&rdquo;</p>}
            </Card>
          )}
          <Card>
            <SectionHeading title="Payment" />
            {(() => {
              const v = paymentView(order.state, payment);
              const a = payment?.latest;
              return (
                <div className="space-y-1.5 text-xs">
                  <p><Badge tone={v.tone}>{v.status}</Badge></p>
                  {a ? (
                    <p className="text-muted">
                      Last card payment: {a.state === "SUCCEEDED" ? "confirmed by the payment provider" : a.state === "PROCESSING" ? "being confirmed by the payment provider" : a.state === "FAILED" ? `didn't go through${a.failureReason ? ` — ${a.failureReason}` : ""}` : "started, not finished"}
                      {a.providerRef ? <> · ref <span className="font-mono">{a.providerRef}</span></> : null}
                    </p>
                  ) : (
                    <p className="text-muted">The sponsor pays by card from their order page once it&rsquo;s approved.</p>
                  )}
                  {payment?.testProvider && <p className="text-[11px] text-faint">Test payment provider — staging only, no real money.</p>}
                </div>
              );
            })()}
          </Card>
        </div>
      </div>
    </div>
  );
}
