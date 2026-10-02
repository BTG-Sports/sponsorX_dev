import Link from "next/link";

import { Badge, Card } from "@/components/ui";
import { EmptyState, ErrorPanel, SkeletonRows } from "@/components/states";
import { SellerMarkDelivered } from "@/components/seller-mark-delivered";
import { DeliveryTrack } from "@/components/order-bits";
import { SellerApprovalsPanel } from "@/components/seller-approval";
import { SellerProblemAnswer } from "@/components/seller-problem-answer";
import { SellerCancelBox, SellerCantDeliver } from "@/components/seller-order-cancel";
import { LISTINGS_CHECKED_NOTE, listingsChecked, sellerCancelBanner, sellerRefundCents } from "@/lib/cancellations-live";
import type { ApiSellerApproval } from "@/lib/order-automation-live";
import type { DemoState } from "@/lib/demo";
import {
  SELLER, dayOf, datesText, lineSummary, lineTotalCents, markControl, orderBadge, orderBanner, shareNote, shareUsd, stamp, trackSteps,
  type ApiSellerOrder, type SellerKind,
} from "@/lib/seller-orders-live";

/* --------------------------------------------------------------------------
   2S4-FE-03 — the seller's Orders page, shared by the athlete portal
   (/athlete/sales) and the property portal (/property/sales). Claude Design
   Orders.dc.html: the list, and one order (detail · waiting · confirmed ·
   problem · unpaid). `kind` is the design's `who` prop — riley | hawks.

   Live: every row is GET /sales (2S4-BE-06) — the caller's own sold lines
   and own share; Mark delivered posts through seller-mark-delivered.tsx
   (2S4-BE-07).

   2S4-FE-06 (OrderCancellations.dc.html, CX-6 … CX-8d): the sponsor's
   request to cancel — with the deadline and Agree / Keep — and how a
   cancelled line ended, in the box above the line (SellerCancelBox);
   "Can't deliver this line?" under Mark delivered while the line can still
   be cancelled (SellerCantDeliver); and, once two cancellations in 90 days
   are reached, only that "BTG is checking your account" — never why.
   -------------------------------------------------------------------------- */

function StatusPill({ o }: { o: ApiSellerOrder }) {
  const b = orderBadge(o);
  return (
    <Badge tone={b.tone}>
      <span aria-hidden="true" className="mr-1">{b.mark}</span>
      {b.label}
    </Badge>
  );
}

function Heading() {
  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Orders</h1>
      <p className="mt-1 text-xs text-muted">Every sale of your items. You see your own share only.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ list */

export function SellerOrdersList({ kind, orders, demo, approvals = [], now = new Date() }: {
  kind: SellerKind;
  orders: ApiSellerOrder[];
  demo: DemoState;
  /** 2S4-FE-05 — orders the seller's listings ask them to approve (GET /seller-approvals), not yet sales. */
  approvals?: ApiSellerApproval[];
  now?: Date;
}) {
  const base = SELLER[kind].basePath;
  /* A roster athlete's line is sold by their team: their team's share is elsewhere. */
  const soldByTeam = orders.some((o) => o.line.athlete !== null && o.line.soldBy !== o.line.athlete);
  return (
    <div className="space-y-6">
      <Heading />

      {demo === "loading" ? (
        <Card className="p-0"><SkeletonRows rows={4} /></Card>
      ) : demo === "error" ? (
        <ErrorPanel title="Orders didn’t load" hint="The rest of the portal still works. Try again in a minute." />
      ) : demo === "empty" || (orders.length === 0 && approvals.length === 0) ? (
        <EmptyState mark="inbox" title="No orders yet" hint="When a sponsor buys one of your items, the order shows here and we email you." />
      ) : (
        <div className="space-y-5">
          <SellerApprovalsPanel kind={kind} approvals={approvals} now={now} />
          {orders.length > 0 && (
            <div className="space-y-2">
              <section aria-label="Orders">
                <Card className="p-0">
                  <div className="hidden grid-cols-[8rem_9rem_minmax(0,1fr)_8rem_10rem_6rem_5rem] gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint lg:grid">
                    <span>Order</span>
                    <span>Sponsor</span>
                    <span>What was bought</span>
                    <span>Dates</span>
                    <span>Status</span>
                    <span className="text-right">Your share</span>
                    <span className="sr-only">Open</span>
                  </div>
                  <ul className="divide-y divide-line-soft">
                    {orders.map((o) => (
                      <li key={o.id} className="grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs lg:grid-cols-[8rem_9rem_minmax(0,1fr)_8rem_10rem_6rem_5rem] lg:items-start">
                        <span className="flex items-start justify-between gap-2 lg:block">
                          <strong className="text-sm font-semibold">{o.ref}</strong>
                          <span className="lg:hidden"><StatusPill o={o} /></span>
                        </span>
                        <span className="hidden lg:block">{o.sponsor.name}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] lg:text-xs">{o.line.title}</span>
                          <span className="hidden text-[11px] text-muted lg:block">{lineSummary(o.line)}</span>
                          <span className="block text-[11px] text-muted lg:hidden">
                            {o.sponsor.name} · {lineSummary(o.line)} · {datesText(o.line.dates)}
                          </span>
                        </span>
                        <span className="hidden text-muted lg:block">{datesText(o.line.dates)}</span>
                        <span className="hidden lg:block"><StatusPill o={o} /></span>
                        <span className="flex justify-between text-[13px] lg:block lg:text-right lg:text-sm">
                          <span className="text-muted lg:hidden">Your share</span>
                          <strong className="font-semibold tabular-nums">{shareUsd(o.shareCents)}</strong>
                        </span>
                        <span className="lg:text-right">
                          <Link
                            href={`${base}/${o.id}`}
                            aria-label={`Open order ${o.ref}`}
                            className="mt-1 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-cta-ink hover:bg-primary-soft lg:mt-0 lg:min-h-9 lg:w-auto lg:px-3.5 lg:text-xs"
                          >
                            <span className="lg:hidden">Open order</span>
                            <span className="hidden lg:inline">Open →</span>
                          </Link>
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
              <p className="text-[11px] text-faint">{shareNote(kind, soldByTeam)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- detail */

const BANNER_TONE = {
  primary: { box: "border-primary/40 bg-primary/8", title: "text-primary-soft" },
  warn: { box: "border-warn/40 bg-warn/8", title: "text-warn" },
  accent: { box: "border-accent/40 bg-accent/10", title: "text-accent" },
  danger: { box: "border-danger/40 bg-danger/10", title: "text-danger" },
} as const;


export function SellerOrderDetail({ kind, order: o, now = new Date() }: { kind: SellerKind; order: ApiSellerOrder; now?: Date }) {
  const seller = SELLER[kind];
  const banner = orderBanner(o, now);
  /* 2S4-FE-06 — a request to cancel, or how a cancelled line ended. */
  const cancelBox = sellerCancelBanner(o, lineTotalCents(o), now);
  const held = listingsChecked(o.cancellation);
  /* 2S4-FE-05 — a problem the sponsor reported, while it is the seller's to answer (72 hours). */
  const answering = o.state === "PROBLEM" && o.issue?.kind === "PROBLEM" && o.issue.stage === "SELLER_TO_ANSWER" && (o.canAnswerProblem ?? o.issue.sellerCanAnswer) && o.issue.sellerDueAt
    ? o.issue
    : null;
  const mark = markControl(o);
  const steps = trackSteps(o);
  const units = `${o.line.quantity} ${o.line.quantity === 1 ? o.line.unit : `${o.line.unit}s`}`;

  return (
    <div className="space-y-6">
      <Heading />

      <div className="space-y-4">
        <Link href={seller.basePath} className="text-xs text-muted hover:text-text">← Orders</Link>
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-lg font-semibold tracking-tight">Order {o.ref}</h2>
          <StatusPill o={o} />
        </div>

        {answering && (
          <SellerProblemAnswer
            lineId={o.id}
            sponsor={o.sponsor.name}
            problem={answering.problem}
            sellerDueAt={answering.sellerDueAt!}
            refundCents={lineTotalCents(o)}
            now={now.toISOString()}
          />
        )}

        {cancelBox && (
          <SellerCancelBox lineId={o.id} title={o.line.title} sponsor={o.sponsor.name} refundCents={sellerRefundCents(o)} banner={cancelBox} />
        )}

        {banner && (
          <div role="status" className={`rounded-xl border px-4 py-3.5 ${BANNER_TONE[banner.tone].box}`}>
            <p className={`text-sm font-semibold ${BANNER_TONE[banner.tone].title}`}>{banner.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-text/85">{banner.text}</p>
            {banner.quote && <p className="mt-2.5 rounded-lg border border-line bg-bg px-3.5 py-3 text-[13px] leading-relaxed">{banner.quote}</p>}
            {banner.money && (
              <Link href={seller.moneyHref} className="mt-2.5 inline-block text-[13px] font-semibold text-primary-soft hover:underline">
                {seller.moneyLabel} →
              </Link>
            )}
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 space-y-4">
            <section aria-label="Order line">
              <Card>
                <div className="flex flex-wrap items-start gap-3">
                  <span className="min-w-[12rem] flex-1">
                    <strong className="block text-sm font-semibold">{o.line.title}</strong>
                    <span className="text-xs text-muted">
                      {lineSummary(o.line)} · {datesText(o.line.dates)} · sold by {o.line.soldBy}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[11px] text-muted">Your share</span>
                    <strong className="text-lg tabular-nums">{shareUsd(o.shareCents)}</strong>
                  </span>
                </div>

                <DeliveryTrack steps={steps} label="Delivery progress" />

                <div className="mt-4">
                  <SellerMarkDelivered
                    lineId={o.id}
                    applies={mark.applies}
                    why={mark.why}
                    sponsor={o.sponsor.name}
                    summary={`${o.line.title} · ${units} · ${datesText(o.line.dates)}`}
                  />
                  {o.cancellation?.canCancel && (
                    <div className="mt-2">
                      <SellerCantDeliver lineId={o.id} title={o.line.title} sponsor={o.sponsor.name} refundCents={sellerRefundCents(o)} cancellation={o.cancellation} />
                    </div>
                  )}
                </div>
              </Card>
            </section>

            {o.deliveryNote && o.markedAt && (
              <section aria-label="Your delivery note">
                <Card>
                  <h2 className="text-sm font-semibold">Your delivery note</h2>
                  <p className="mt-2 text-[13px] leading-relaxed">{o.deliveryNote}</p>
                  {(o.proof.photo || o.proof.link) && (
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                      {o.proof.photo && <span>Photo attached</span>}
                      {o.proof.link && (
                        <a href={o.proof.link} target="_blank" rel="noopener noreferrer" className="break-all text-primary-soft hover:underline">
                          {o.proof.link}
                        </a>
                      )}
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] text-faint">
                    Marked delivered by {o.markedBy ?? "you"} · {stamp(o.markedAt)}
                  </p>
                </Card>
              </section>
            )}
          </div>

          <aside aria-label="Sponsor contact" className="space-y-3">
            {held && (
              <p role="status" className="rounded-lg border border-warn/45 bg-warn/8 px-3 py-2.5 text-xs leading-relaxed">
                <strong className="text-warn">Your listings:</strong> {LISTINGS_CHECKED_NOTE}
              </p>
            )}
            <Card className="space-y-2.5">
              <h2 className="text-sm font-semibold">Sponsor</h2>
              <p className="text-[15px] font-semibold">{o.sponsor.name}</p>
              {o.sponsor.contact ? (
                <dl className="grid grid-cols-[3.5rem_1fr] gap-x-2.5 gap-y-1.5 text-[13px]">
                  <dt className="text-muted">Contact</dt>
                  <dd>{o.sponsor.contact.name}</dd>
                  <dt className="text-muted">Email</dt>
                  <dd className="break-all">{o.sponsor.contact.email}</dd>
                  {o.sponsor.contact.phone && (
                    <>
                      <dt className="text-muted">Phone</dt>
                      <dd>{o.sponsor.contact.phone}</dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="rounded-lg border border-line bg-bg px-3.5 py-3 text-xs leading-relaxed text-text/85">
                  Contact details appear once {o.sponsor.name} has paid.
                </p>
              )}
              <p className="text-[11px] text-faint">Ordered {dayOf(o.placedAt)}{o.paidAt ? ` · paid ${dayOf(o.paidAt)}` : ""}</p>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** An id that matches no order the seller sold. */
export function SellerOrderMissing({ kind }: { kind: SellerKind }) {
  return (
    <div className="space-y-6">
      <Heading />
      <Link href={SELLER[kind].basePath} className="text-xs text-muted hover:text-text">← Orders</Link>
      <EmptyState mark="inbox" title="No order matches this link" hint="It may be another seller’s order, or the link is wrong." action={{ label: "Your orders", href: SELLER[kind].basePath }} />
    </div>
  );
}
