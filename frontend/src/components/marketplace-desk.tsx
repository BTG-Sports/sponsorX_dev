"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";

import { MopsAutoPublishedList, MopsListingQueue } from "@/components/mops-listing-queue";
import { PayoutRetry } from "@/components/payout-decision";
import { Primary, StageTable, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import {
  LISTING_TABS, QUEUES, agoLabel, failedTriesLabel, failureCopy, isOverdue, linkTiles, payoutProblemSince, shortId, usd, waitLabel,
  type ApiDeskCounts, type ApiFailedPayment, type ApiListing, type ApiMarketplaceOrder, type ApiPage, type ListingTab, type QueueKey,
} from "@/lib/marketplace-ops-live";
import { ORG_TYPE_COPY, type ApiOnboarding } from "@/lib/onboarding-live";
import { payeeKind, type ApiAdminPayout } from "@/lib/payouts-live";
import { retryPayoutAction } from "@/app/(app)/admin/payouts/actions";

/* --------------------------------------------------------------------------
   The marketplace desk — /admin/marketplace (2S7-FE-02), restructured as
   P1-ART-20 (2026-10-07; owner: "same in /admin/marketplace, the structure
   looks shit").

   Before: six stat tiles, then six full-width cards stacked down the page,
   each a hint plus "nothing here" — the same number said twice, two screens
   to learn that four queues are empty.

   Now: the QUEUE STRIP — five tiles, one per queue, in the order BTG works
   them, each with its count, one line of context (the oldest wait, what's
   live) and a tone for work waiting. A tile IS the navigation: the picked
   queue's rows show under the strip as one panel — a stage table for
   applications, orders, failed payments and payout problems; the listing
   desks keep their inline-action rows (approve, request changes, pause,
   end) under their own three tabs. The desk opens on the first queue with
   work in it. The pick lives in the URL (`?queue=`, instantly, no scroll
   jump) so a queue is a link; the listing emails' `?listings=held#listing-…`
   links still land on the right row.

   Every row's data was read by the server page in one parallel pass, as
   before; switching queues reads nothing.
   -------------------------------------------------------------------------- */

const PATH = "/admin/marketplace";

export type Queue<T> = { rows: T[]; total: number } | { forbidden: true };
export type LiveQueue = { rows: ApiListing[]; page: ApiPage } | { forbidden: true };

export type DeskData = {
  applications: Queue<ApiOnboarding>;
  held: Queue<ApiListing>;
  auto: Queue<ApiListing>;
  live: LiveQueue;
  orders: Queue<ApiMarketplaceOrder>;
  payments: Queue<ApiFailedPayment>;
  payouts: Queue<ApiAdminPayout>;
};

const count = (q: Queue<unknown> | LiveQueue): number | null => ("forbidden" in q ? null : "page" in q ? q.page.total : q.total);
const n = (v: number | null) => (v === null ? "—" : String(v));

export function MarketplaceDesk({ data, links, queue: initialQueue, tab: initialTab, now }: { data: DeskData; links: ApiDeskCounts; queue: QueueKey; tab: ListingTab; now: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [queue, setQueue] = useState<QueueKey>(initialQueue);
  const [tab, setTab] = useState<ListingTab>(initialTab);

  const go = (q: QueueKey, t: ListingTab = tab) => {
    setQueue(q);
    setTab(t);
    const u = new URLSearchParams({ queue: q });
    if (q === "listings" && t !== "held") u.set("listings", t);
    router.replace(`${pathname}?${u}`, { scroll: false });
  };

  const oldest = (rows: { at: string | null }[]) => {
    const w = rows.map((r) => waitLabel(r.at, now)).filter(Boolean)[0];
    return w ? `oldest waiting ${w}` : null;
  };
  const late = (rows: { at: string | null }[]) => rows.some((r) => isOverdue(r.at, now));

  const tiles: { key: QueueKey; count: number | null; caption: string; tone: "warn" | "danger" | "quiet" }[] = QUEUES.map((q) => {
    switch (q.key) {
      case "applications": {
        const c = count(data.applications);
        const rows = "rows" in data.applications ? data.applications.rows.map((o) => ({ at: o.submittedAt })) : [];
        return { key: q.key, count: c, caption: c ? oldest(rows) ?? "waiting for review" : "nothing waiting", tone: c ? (late(rows) ? "danger" : "warn") : "quiet" };
      }
      case "listings": {
        const held = count(data.held);
        const live = count(data.live);
        return { key: q.key, count: held, caption: `${n(held)} held · ${n(live)} live`, tone: held ? "warn" : "quiet" };
      }
      case "orders": {
        const c = count(data.orders);
        const rows = "rows" in data.orders ? data.orders.rows.map((o) => ({ at: o.createdAt })) : [];
        return { key: q.key, count: c, caption: c ? oldest(rows) ?? "over the sponsor's limit" : "none held", tone: c ? (late(rows) ? "danger" : "warn") : "quiet" };
      }
      case "payments": {
        const c = count(data.payments);
        const latest = "rows" in data.payments ? data.payments.rows[0]?.failedAt : undefined;
        return { key: q.key, count: c, caption: c && latest ? `latest failed ${agoLabel(latest, now)}` : c ? "cards declined" : "none failed", tone: c ? "danger" : "quiet" };
      }
      case "payouts": {
        const c = count(data.payouts);
        return { key: q.key, count: c, caption: c ? "the provider couldn't send" : "none stuck", tone: c ? "danger" : "quiet" };
      }
    }
  });

  return (
    <div className="space-y-5">
      <section aria-label="Queues">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {tiles.map((t, i) => {
            const q = QUEUES[i]!;
            const on = t.key === queue;
            const tone = t.tone === "danger" ? "text-[#fdba74]" : t.tone === "warn" ? "text-[#93c5fd]" : "text-[#5b6b7d]";
            const edge = on ? "bg-[#9be0ff] shadow-[0_0_10px_#9be0ff]" : t.tone === "danger" ? "bg-[#f97a1f]" : t.tone === "warn" ? "bg-[#2e9bf5]" : "bg-white/10";
            return (
              <li key={t.key} className="sx-ops-in min-w-0" style={{ "--sx-reveal-delay": `${i * 0.06}s` } as CSSProperties}>
                <button
                  type="button"
                  onClick={() => go(t.key)}
                  aria-pressed={on}
                  aria-label={`${q.label}: ${n(t.count)}, ${t.caption}`}
                  className={`relative block w-full min-w-0 rounded-md border px-3.5 pb-3 pt-3 text-left transition-all duration-300 ${
                    on ? "border-[#9be0ff] bg-[#0d1b2e]/90 shadow-[0_0_22px_rgba(46,155,245,.35)]" : "border-[#63b4f8]/22 bg-[#0a1424]/70 hover:border-[#63b4f8]/60 hover:bg-[#0c1829]/90"
                  }`}
                >
                  <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[2px] ${edge}`} />
                  <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a96a3]">{q.label}</span>
                  <span className={`mt-1.5 block text-[26px] font-bold leading-none tracking-tight tabular-nums ${t.count ? (on ? "text-white" : tone) : "text-[#5b6b7d]"}`}>{n(t.count)}</span>
                  <span className="mt-1.5 block truncate text-[11px] text-[#7e88a0]">{t.caption}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 2S7-FE-02 — the exceptions that live on other desks: the API's count and the desk that actions it. */}
      <section aria-label="On other desks">
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {linkTiles(links).map((t, i) => {
            const tone = t.tone === "danger" ? "text-[#fdba74]" : t.tone === "warn" ? "text-[#93c5fd]" : "text-[#5b6b7d]";
            const edge = t.tone === "danger" ? "bg-[#f97a1f]" : t.tone === "warn" ? "bg-[#2e9bf5]" : "bg-white/10";
            return (
              <li key={t.key} className="sx-ops-in min-w-0" style={{ "--sx-reveal-delay": `${0.3 + i * 0.06}s` } as CSSProperties}>
                <Link
                  href={t.href}
                  aria-label={`${t.label}: ${n(t.count)}, ${t.caption} — open the desk`}
                  className="group relative block w-full min-w-0 rounded-md border border-[#63b4f8]/22 bg-[#0a1424]/50 px-3.5 pb-3 pt-3 text-left transition-all duration-300 hover:border-[#63b4f8]/60 hover:bg-[#0c1829]/90"
                >
                  <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[2px] ${edge}`} />
                  <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8a96a3]">
                    <span className="truncate">{t.label}</span>
                    <span aria-hidden="true" className="ml-auto shrink-0 text-[#9be0ff]/70 transition-transform group-hover:translate-x-0.5">→</span>
                  </span>
                  <span className={`mt-1.5 block text-[26px] font-bold leading-none tracking-tight tabular-nums ${t.count ? tone : "text-[#5b6b7d]"}`}>{n(t.count)}</span>
                  <span className="mt-1.5 block truncate text-[11px] text-[#7e88a0]">{t.caption}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <div key={queue} className="sx-ops-in">
        {queue === "applications" && <ApplicationsPanel q={data.applications} now={now} />}
        {queue === "listings" && <ListingsPanel data={data} tab={tab} onTab={(t) => go("listings", t)} now={now} />}
        {queue === "orders" && <OrdersPanel q={data.orders} now={now} />}
        {queue === "payments" && <PaymentsPanel q={data.payments} now={now} />}
        {queue === "payouts" && <PayoutsPanel q={data.payouts} now={now} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- panels */

function PanelHead({ title, hint, action }: { title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="sx-section-title text-sm font-semibold">{title}</h2>
        <p className="mt-1 max-w-3xl text-[11px] text-muted">{hint}</p>
      </div>
      {action}
    </div>
  );
}

function Clear({ children }: { children: ReactNode }) {
  return (
    <div className="sx-card rounded-lg border border-dashed border-line px-5 py-6">
      <p className="text-sm font-semibold">All clear</p>
      <p className="mt-0.5 text-[11px] text-muted">{children}</p>
    </div>
  );
}
function Forbidden() {
  return (
    <div className="sx-card rounded-lg border border-line px-5 py-6">
      <p className="text-sm font-semibold">Outside your role</p>
      <p className="mt-0.5 text-[11px] text-muted">The API refused this queue.</p>
    </div>
  );
}

const more = (href: string, label: string) => (
  <Link href={href} className="text-[11px] font-semibold text-primary-soft hover:underline">{label}</Link>
);

function ApplicationsPanel({ q, now }: { q: Queue<ApiOnboarding>; now: number }) {
  const cols: Column[] = [
    { key: "org", label: "Organization" },
    { key: "type", label: "Type" },
    { key: "submitted", label: "Submitted" },
    { key: "wait", label: "Waiting" },
    { key: "open", label: "Review", srOnly: true },
  ];
  return (
    <section aria-label="Property applications">
      <PanelHead title="Property applications" hint="Submitted and waiting for BTG, oldest first. Decide on the application's own page." action={more("/admin/onboarding", "All applications →")} />
      {"forbidden" in q ? <Forbidden /> : q.rows.length === 0 ? (
        <Clear>New applications arrive here when an organization submits the wizard.</Clear>
      ) : (
        <StageTable label="Property applications waiting for review" columns={cols}>
          {q.rows.map((o, i) => {
            const over = isOverdue(o.submittedAt, now);
            return (
              <Tr key={o.id} i={i} tone={over ? "danger" : "warn"}>
                <Td><Primary sub={o.stateCode ?? undefined}><Link href={`/admin/onboarding/${o.id}`} className="hover:underline">{o.orgName}</Link></Primary></Td>
                <Td label="Type" muted>{ORG_TYPE_COPY[o.orgType]?.label ?? o.orgType}</Td>
                <Td label="Submitted" muted>{o.submittedAt ? agoLabel(o.submittedAt, now) : "—"}</Td>
                <Td label="Waiting"><span className={`tabular-nums ${over ? "font-semibold text-warn" : "text-muted"}`}>{waitLabel(o.submittedAt, now) ?? "—"}</span></Td>
                <Td act><Link href={`/admin/onboarding/${o.id}`} className="font-medium text-primary hover:underline">Review →</Link></Td>
              </Tr>
            );
          })}
        </StageTable>
      )}
      {"rows" in q && q.total > q.rows.length && (
        <p className="mt-2 text-[11px] text-muted">Showing the oldest {q.rows.length} of {q.total}. {more("/admin/onboarding", "The whole queue →")}</p>
      )}
    </section>
  );
}

const HINT: Record<ListingTab, string> = {
  held: "A listing goes live on its own when its checks pass. These were flagged — the reasons are on each. Approving puts it live; blockers must be cleared by the seller first.",
  auto: "Went live on their own in the last 30 days, newest first. Pause or end one with a reason — the seller is emailed it, and only BTG puts a listing it paused back live.",
  live: "Every listing on sale now, however it went live, newest first. Pause or end any of them with a reason — the seller is emailed it.",
};

function ListingsPanel({ data, tab, onTab, now }: { data: DeskData; tab: ListingTab; onTab: (t: ListingTab) => void; now: number }) {
  const held = count(data.held);
  const auto = count(data.auto);
  const live = count(data.live);
  const body = () => {
    if (tab === "held") {
      if ("forbidden" in data.held) return <Forbidden />;
      if (data.held.rows.length === 0) return <Clear>Every listing submitted lately passed its checks and went live.</Clear>;
      return <div className="sx-card rounded-lg border border-line"><MopsListingQueue listings={data.held.rows} now={now} /></div>;
    }
    if (tab === "auto") {
      if ("forbidden" in data.auto) return <Forbidden />;
      if (data.auto.rows.length === 0) return <Clear>No listings went live automatically in the last 30 days.</Clear>;
      return <div className="sx-card rounded-lg border border-line"><MopsAutoPublishedList listings={data.auto.rows} now={now} /></div>;
    }
    if ("forbidden" in data.live) return <Forbidden />;
    if (data.live.rows.length === 0) {
      return data.live.page.total > 0
        ? <Clear><Link href={`${PATH}?queue=listings&listings=live`} className="text-primary hover:underline">Nothing on this page — back to the first page</Link></Clear>
        : <Clear>No listings are live right now.</Clear>;
    }
    return (
      <div className="sx-card rounded-lg border border-line">
        <MopsAutoPublishedList listings={data.live.rows} now={now} />
        <LivePager page={data.live.page} />
      </div>
    );
  };
  return (
    <section aria-label="Listings" id="listings">
      <PanelHead title="Listings" hint={HINT[tab]} />
      <div className="mb-3">
        <TabStrip label="Listing desks">
          {LISTING_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="link"
              aria-current={t.key === tab ? "page" : undefined}
              onClick={() => onTab(t.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${t.key === tab ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${t.key === "held" && held ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>
                {t.key === "held" ? n(held) : t.key === "auto" ? n(auto) : n(live)}
              </span>
            </button>
          ))}
        </TabStrip>
      </div>
      {body()}
    </section>
  );
}

/** The live listings' pages — the API's own 25 a page (LiveListingsQuery), read by the server page. */
function LivePager({ page }: { page: ApiPage }) {
  if (page.pages <= 1) return null;
  const href = (p: number) => `${PATH}?queue=listings&listings=live&page=${p}#listings`;
  return (
    <nav aria-label="Live listings pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-5 py-3 text-xs">
      {page.page > 1 ? <Link href={href(page.page - 1)} className="text-primary hover:underline">← Newer</Link> : <span />}
      <span className="tabular-nums text-muted">Page {page.page} of {page.pages} · {page.total} live</span>
      {page.page < page.pages ? <Link href={href(page.page + 1)} className="text-primary hover:underline">Older →</Link> : <span />}
    </nav>
  );
}

function OrdersPanel({ q, now }: { q: Queue<ApiMarketplaceOrder>; now: number }) {
  const cols: Column[] = [
    { key: "order", label: "Order" },
    { key: "total", label: "Total", num: true },
    { key: "lines", label: "Lines" },
    { key: "why", label: "Held because" },
    { key: "wait", label: "Waiting" },
    { key: "open", label: "Open", srOnly: true },
  ];
  return (
    <section aria-label="Orders awaiting approval">
      <PanelHead title="Orders awaiting approval" hint="Only orders above the sponsor's spending limit wait for BTG — the rest are approved on their own. Open one to see the limit and decide." />
      {"forbidden" in q ? <Forbidden /> : q.rows.length === 0 ? <Clear>No orders are held for approval.</Clear> : (
        <StageTable label="Orders awaiting approval" columns={cols}>
          {q.rows.map((o, i) => {
            const over = isOverdue(o.createdAt, now);
            return (
              <Tr key={o.id} i={i} tone={over ? "danger" : "warn"}>
                <Td><Primary sub={`sponsor ${o.sponsorId}`}><Link href={`${PATH}/orders/${o.id}`} className="hover:underline">{shortId(o.id)}</Link></Primary></Td>
                <Td label="Total" num className="font-semibold">{usd(o.totalCents)}</Td>
                <Td label="Lines" muted>{o.lines.length} line{o.lines.length === 1 ? "" : "s"}{o.lines[0] ? ` · ${o.lines[0].title}${o.lines.length > 1 ? " and more" : ""}` : ""}</Td>
                <Td label="Held because">{o.approvalReasons.length ? <span className="text-[11px] text-warn">{o.approvalReasons.join("; ")}</span> : <span className="text-faint">—</span>}</Td>
                <Td label="Waiting"><span className={`tabular-nums ${over ? "font-semibold text-warn" : "text-muted"}`}>{waitLabel(o.createdAt, now) ?? "—"}</span></Td>
                <Td act><Link href={`${PATH}/orders/${o.id}`} className="font-medium text-primary hover:underline">Decide →</Link></Td>
              </Tr>
            );
          })}
        </StageTable>
      )}
    </section>
  );
}

function PaymentsPanel({ q, now }: { q: Queue<ApiFailedPayment>; now: number }) {
  const cols: Column[] = [
    { key: "order", label: "Order" },
    { key: "sponsor", label: "Sponsor" },
    { key: "amount", label: "Amount", num: true },
    { key: "reason", label: "Provider said" },
    { key: "failed", label: "Failed" },
    { key: "open", label: "Open", srOnly: true },
  ];
  return (
    <section aria-label="Failed payments">
      <PanelHead title="Failed payments" hint="The sponsor's latest card payment didn't go through. They can pay again from their order; open one to cancel it, or mark it paid if they paid another way." />
      {"forbidden" in q ? <Forbidden /> : q.rows.length === 0 ? <Clear>No card payment has failed on an order still owing.</Clear> : (
        <StageTable label="Failed payments" columns={cols}>
          {q.rows.map((p, i) => (
            <Tr key={p.orderId} i={i} tone="danger">
              <Td><Primary sub={failedTriesLabel(p.failedTries)}><Link href={`${PATH}/orders/${p.orderId}`} className="hover:underline">{p.orderRef}</Link></Primary></Td>
              <Td label="Sponsor">{p.sponsorName}</Td>
              <Td label="Amount" num className="font-semibold">{usd(p.amountCents)}</Td>
              <Td label="Provider said"><span className="text-[11px] text-danger">{failureCopy(p.failureReason)}</span></Td>
              <Td label="Failed"><span className={`tabular-nums ${isOverdue(p.failedAt, now) ? "font-semibold text-warn" : "text-muted"}`}>{agoLabel(p.failedAt, now)}</span></Td>
              <Td act><Link href={`${PATH}/orders/${p.orderId}`} className="font-medium text-primary hover:underline">Open →</Link></Td>
            </Tr>
          ))}
        </StageTable>
      )}
    </section>
  );
}

function PayoutsPanel({ q, now }: { q: Queue<ApiAdminPayout>; now: number }) {
  const cols: Column[] = [
    { key: "payee", label: "Payee" },
    { key: "amount", label: "Amount", num: true },
    { key: "orders", label: "Orders" },
    { key: "reason", label: "Couldn't send" },
    { key: "updated", label: "Updated" },
    { key: "retry", label: "Retry", srOnly: true },
  ];
  return (
    <section aria-label="Payout problems">
      <PanelHead
        title="Payout problems"
        hint="The payment provider couldn't send these. Retry hands one back to the provider — ask the payee to update their payout account on Stripe first when that's the problem."
        action={more("/admin/payouts?tab=problems", "Payout approvals →")}
      />
      {"forbidden" in q ? <Forbidden /> : q.rows.length === 0 ? <Clear>Every payout the provider was handed went through, or is retrying on its own.</Clear> : (
        <StageTable label="Payouts the provider couldn't send" columns={cols}>
          {q.rows.map((p, i) => (
            <Tr key={p.id} i={i} tone="danger">
              <Td><Primary sub={payeeKind(p.payeeType)}><Link href={`/admin/payouts/${p.id}`} className="hover:underline">{p.payeeName}</Link></Primary></Td>
              <Td label="Amount" num className="font-semibold">{usd(p.amountCents)}</Td>
              <Td label="Orders" muted className="tabular-nums">{p.lines.length ? p.lines.map((l) => l.orderRef).join(", ") : "—"}</Td>
              <Td label="Couldn't send"><span className="text-[11px] text-danger">{failureCopy(p.failureReason)}</span></Td>
              <Td label="Updated" muted>{agoLabel(payoutProblemSince(p), now)}</Td>
              <Td act><PayoutRetry retry={retryPayoutAction.bind(null, p.id)} /></Td>
            </Tr>
          ))}
        </StageTable>
      )}
      {"rows" in q && q.total > q.rows.length && (
        <p className="mt-2 text-[11px] text-muted">Showing {q.rows.length} of {q.total}. {more("/admin/payouts?tab=problems", "All of them →")}</p>
      )}
    </section>
  );
}
