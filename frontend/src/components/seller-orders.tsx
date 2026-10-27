import Link from "next/link";
import type { ReactNode } from "react";

import { ArenaChip, ArenaHead, ArenaUpdated, ArenaPanel, ArenaSection, ArenaTile, ArenaTiles, at, type ArenaTone } from "@/components/arena-stage";
import { Badge, Card } from "@/components/ui";
import { EmptyState, ErrorPanel, SkeletonRows } from "@/components/states";
import { SellerMarkDelivered } from "@/components/seller-mark-delivered";
import { DeadlineChip, DeliveryTrack, StatePill } from "@/components/order-bits";
import { SellerProblemAnswer } from "@/components/seller-problem-answer";
import { SellerCancelBox, SellerCantDeliver } from "@/components/seller-order-cancel";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { ListSearch, PagerRow, PendingList, ServerList } from "@/components/server-pager";
import type { FilterTone } from "@/components/filter-kit";
import { LISTINGS_CHECKED_NOTE, listingsChecked, sellerCancelBanner, sellerRefundCents } from "@/lib/cancellations-live";
import { approvalAsk, approvalBadge, deadline, type ApiSellerApproval } from "@/lib/order-automation-live";
import type { DemoState } from "@/lib/demo";
import { pageOrAll, type PageInfo } from "@/lib/list-query";
import {
  APPROVAL_KEYS, SELLER, dayOf, datesText, lineSummary, lineTotalCents, markControl, orderBadge, orderBanner, salesTabs, salesTiles, shareNote, shareUsd, stamp, trackSteps,
  type ApiSalesTab, type ApiSellerOrder, type SellerKind, type Tone,
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

   P1-ART-22 (2026-10-11) — the list is SERVER-PAGED and, for the athlete,
   drawn on the Arena (arena-stage.tsx) as a dashboard: ArenaHead with the
   provenance pill, KPI plates from the API's tab counts and
   `counts.waiting` (never the rows on screen), the approvals waiting for
   an answer as a paged warn plate with its own pager keys (apage / asize),
   the tab strip from `tabs`, then one PagedTable of the sold lines. The
   property portal passes `kind="team"` and keeps its own heading and tone
   ("property"); a caller that still hands over a whole list (no `page`)
   gets one page of it, so both portals work while the backend lands. The
   approvals rows moved here from seller-approval.tsx so that file can
   import OrdersHead for the detail's title row without a cycle.
   -------------------------------------------------------------------------- */

const LEDE = "Every sale of your items. You see your own share only.";

const CHIP_TONE: Record<Tone, ArenaTone> = { neutral: "ink", primary: "blue", accent: "win", warn: "warn", danger: "danger" };

function StatusPill({ o, arena }: { o: ApiSellerOrder; arena: boolean }) {
  const b = orderBadge(o);
  if (arena) {
    return (
      <ArenaChip tone={CHIP_TONE[b.tone]}>
        <span aria-hidden="true" className="mr-1">{b.mark}</span>
        {b.label}
      </ArenaChip>
    );
  }
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
      <p className="mt-1 text-xs text-muted">{LEDE}</p>
    </div>
  );
}

/** The Orders title row: the Arena's head for the athlete (P1-ART-22), the plain heading for a team. */
export function OrdersHead({ kind, now = new Date(), pill, children }: { kind: SellerKind; now?: Date; pill?: ReactNode; children?: ReactNode }) {
  if (kind !== "athlete") return <Heading />;
  return (
    <ArenaHead title="Orders" pill={pill ?? <ArenaUpdated at={now} />} lede={LEDE}>
      {children}
    </ArenaHead>
  );
}

/** A list's plate: an Arena panel for the athlete, the plain card for a team. */
function Plate({ arena, children, tone = "blue", delay = 0.3 }: { arena: boolean; children: ReactNode; tone?: ArenaTone; delay?: number }) {
  return arena ? (
    <ArenaPanel flush tone={tone} delay={delay} spot className="pl-2">
      {children}
    </ArenaPanel>
  ) : (
    <Card className="p-0">{children}</Card>
  );
}

/* ------------------------------------------------------------- approvals */

const approvalPath = (kind: SellerKind, id: string) => `${SELLER[kind].basePath}/approvals/${id}`;

/** One order the seller's listing asks them to approve — the ask, its deadline, Answer / Open. */
function ApprovalRow({ kind, a, now, i, arena }: { kind: SellerKind; a: ApiSellerApproval; now: Date; i: number; arena: boolean }) {
  const d = a.canAnswer ? deadline("Answer by", a.dueAt, now) : null;
  return (
    <li className={`${arena ? "sx-arena-in" : ""} flex flex-col gap-2 border-b border-line-soft px-4 py-3.5 text-xs last:border-0 sm:flex-row sm:items-start sm:justify-between`} style={arena ? at(0.4 + i * 0.05) : undefined}>
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
}

/* ------------------------------------------------------------------ list */

const COLUMNS: Column[] = [
  { key: "ref", label: "Order ref" },
  { key: "what", label: "Sponsor · what was sold" },
  { key: "dates", label: "Dates" },
  { key: "qty", label: "Qty", num: true },
  { key: "share", label: "Your share", num: true },
  { key: "status", label: "Status" },
  { key: "open", label: "Open", srOnly: true },
];

const ROW_TONE: Partial<Record<Tone, "warn" | "danger" | "accent">> = { warn: "warn", danger: "danger" };

/** The tab's link: no ?page (a tab change starts at page 1); the search comes along. */
function tabHref(base: string, key: string, q: string): string {
  const u = new URLSearchParams();
  if (key !== "all") u.set("tab", key);
  if (q) u.set("q", q);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

export function SellerOrdersList({
  kind, orders, demo, approvals = [], now = new Date(), page, tabs, tab, q = "", approvalsPage, approvalCounts,
}: {
  kind: SellerKind;
  /** One page of GET /sales — or, from a caller not yet paged, the whole list. */
  orders: ApiSellerOrder[];
  demo: DemoState;
  /** 2S4-FE-05 — orders the seller's listings ask them to approve (GET /seller-approvals), not yet sales. */
  approvals?: ApiSellerApproval[];
  now?: Date;
  /** P1-ART-22 — the paged read's `page`; absent = one page of `orders`. */
  page?: PageInfo;
  /** The API's tabs (`all` first); absent = one "All" tab counting `orders`. */
  tabs?: ApiSalesTab[];
  /** The tab that is on, already validated against `tabs` (default `all`). */
  tab?: string;
  /** The search in force (?q). */
  q?: string;
  /** The approvals' own page (keys apage / asize) and the API's counts. */
  approvalsPage?: PageInfo;
  approvalCounts?: { waiting: number; total: number };
}) {
  const arena = kind === "athlete";
  const tone: FilterTone = arena ? "athlete" : "property";
  const base = SELLER[kind].basePath;
  const tabList = tabs ?? salesTabs({ sales: orders });
  const on = tabList.find((t) => t.key === tab) ?? tabList[0]!;
  const pg = pageOrAll(orders, page);
  const apg = pageOrAll(approvals, approvalsPage);
  const counts = approvalCounts ?? { waiting: approvals.filter((a) => a.canAnswer).length, total: approvals.length };
  const filtered = on.key !== "all" || q !== "";
  /* A roster athlete's line is sold by their team: their team's share is elsewhere. */
  const soldByTeam = orders.some((o) => o.line.athlete !== null && o.line.soldBy !== o.line.athlete);
  const nothingAtAll = demo === "empty" || (pg.total === 0 && approvals.length === 0 && !filtered);
  const tiles = salesTiles(tabList, counts.waiting, base);

  const head = (
    <OrdersHead kind={kind} now={now}>
      {arena && demo === null && (
        <ArenaTiles cols={Math.min(5, Math.max(2, tiles.length)) as 2 | 3 | 4 | 5}>
          {tiles.map((t, i) => (
            <ArenaTile key={t.key} label={t.label} value={t.value} caption={t.caption} tone={t.tone} href={t.href} delay={0.1 + i * 0.06} />
          ))}
        </ArenaTiles>
      )}
    </OrdersHead>
  );

  return (
    <div className={arena ? "space-y-8" : "space-y-6"}>
      {head}

      {demo === "loading" ? (
        <Plate arena={arena}><SkeletonRows rows={4} /></Plate>
      ) : demo === "error" ? (
        <ErrorPanel title="Orders didn’t load" hint="The rest of the portal still works. Try again in a minute." />
      ) : nothingAtAll ? (
        <EmptyState mark="inbox" title="No orders yet" hint="When a sponsor buys one of your items, the order shows here and we email you." />
      ) : (
        <ServerList>
          <div className="space-y-8">
            {approvals.length > 0 && (
              <section aria-label="Orders to approve" className="space-y-3">
                {arena ? (
                  <ArenaSection
                    title={counts.waiting ? `Waiting for your answer · ${counts.waiting}` : "Orders you were asked to approve"}
                    hint={counts.waiting ? "A sponsor ordered something you asked to approve first. Accept or decline within 48 hours, or the order is cancelled." : undefined}
                    delay={0.3}
                  />
                ) : (
                  <h2 className="text-sm font-semibold tracking-tight">
                    {counts.waiting ? `Waiting for your approval · ${counts.waiting}` : "Orders you were asked to approve"}
                  </h2>
                )}
                <PagerRow page={apg} noun="Approvals" tone={tone} position="top" keys={APPROVAL_KEYS} />
                <PendingList>
                  <Plate arena={arena} tone={counts.waiting ? "warn" : "ink"} delay={0.34}>
                    <ul>
                      {approvals.map((a, i) => (
                        <ApprovalRow key={a.id} kind={kind} a={a} now={now} i={i} arena={arena} />
                      ))}
                    </ul>
                  </Plate>
                </PendingList>
                <PagerRow page={apg} noun="Approvals" tone={tone} position="bottom" keys={APPROVAL_KEYS} />
              </section>
            )}

            <section aria-label="Orders" className="space-y-4">
              <div className={`${arena ? "sx-arena-in" : ""} flex flex-wrap items-center gap-3`} style={arena ? at(0.36) : undefined}>
                <TabStrip label="Order status">
                  {tabList.map((t) => (
                    <TabLink key={t.key} href={tabHref(base, t.key, q)} on={t.key === on.key} count={t.count} hot={t.key === "to_deliver" || t.key === "problem"}>
                      {t.label}
                    </TabLink>
                  ))}
                </TabStrip>
                <div className="flex w-full sm:ml-auto sm:w-auto sm:min-w-64">
                  <ListSearch initial={q} label="Search orders" placeholder="Order ref or sponsor" tone={tone} />
                </div>
              </div>

              {orders.length === 0 ? (
                <EmptyState
                  mark="inbox"
                  title={q ? "No order matches that search" : on.key === "all" ? "No orders yet" : `Nothing under “${on.label}”`}
                  hint={q || on.key !== "all" ? "Clear the search or pick another tab to see the rest." : "When a sponsor buys one of your items, the order shows here and we email you."}
                />
              ) : (
                <PagedTable
                  bare
                  page={pg}
                  noun="Orders"
                  filtered={filtered}
                  label={`${on.label} orders`}
                  columns={COLUMNS}
                  tone={tone}
                  foot={<p className="text-[11px] text-faint">{shareNote(kind, soldByTeam)}</p>}
                >
                  {orders.map((o, i) => {
                    const units = `${o.line.quantity} ${o.line.quantity === 1 ? o.line.unit : `${o.line.unit}s`}`;
                    return (
                      <Tr key={o.id} i={i} tone={ROW_TONE[orderBadge(o).tone]}>
                        <Td><Primary sub={`Ordered ${dayOf(o.placedAt)}`}>{o.ref}</Primary></Td>
                        <Td label="Sponsor"><Primary sub={o.line.title}>{o.sponsor.name}</Primary></Td>
                        <Td label="Dates" muted>{datesText(o.line.dates)}</Td>
                        <Td label="Qty" num>
                          <span className={arena ? "sx-arena-num text-sm text-text" : "font-semibold tabular-nums"}>{o.line.quantity}</span>
                          <span className="block text-[11px] text-muted">{units}</span>
                        </Td>
                        <Td label="Your share" num>
                          <span className={arena ? "sx-arena-num text-sm text-text" : "font-semibold tabular-nums"}>{shareUsd(o.shareCents)}</span>
                        </Td>
                        <Td label="Status"><StatusPill o={o} arena={arena} /></Td>
                        <Td act>
                          <Link
                            href={`${base}/${o.id}`}
                            aria-label={`Open order ${o.ref}`}
                            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-cta-ink hover:bg-primary-soft md:min-h-9 md:w-auto md:px-3.5 md:text-xs"
                          >
                            Open →
                          </Link>
                        </Td>
                      </Tr>
                    );
                  })}
                </PagedTable>
              )}
            </section>
          </div>
        </ServerList>
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
  const arena = kind === "athlete";
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
      <OrdersHead kind={kind} now={now} />

      <div className="space-y-4">
        <Link href={seller.basePath} className="text-xs text-muted hover:text-text">← Orders</Link>
        <div className={`${arena ? "sx-arena-in" : ""} flex flex-wrap items-center gap-2.5`} style={arena ? at(0.1) : undefined}>
          <h2 className={arena ? "sx-arena-num text-lg text-text" : "text-lg font-semibold tracking-tight"}>Order {o.ref}</h2>
          <StatusPill o={o} arena={arena} />
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
                    <strong className={arena ? "sx-arena-num text-lg text-athlete" : "text-lg tabular-nums"}>{shareUsd(o.shareCents)}</strong>
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
      <OrdersHead kind={kind} />
      <Link href={SELLER[kind].basePath} className="text-xs text-muted hover:text-text">← Orders</Link>
      <EmptyState mark="inbox" title="No order matches this link" hint="It may be another seller’s order, or the link is wrong." action={{ label: "Your orders", href: SELLER[kind].basePath }} />
    </div>
  );
}
