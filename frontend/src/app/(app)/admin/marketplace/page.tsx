import Link from "next/link";

import { MopsAutoPublishedList, MopsListingQueue } from "@/components/mops-listing-queue";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PayoutRetry } from "@/components/payout-decision";
import { Card, SectionHeading, StatTile } from "@/components/ui";
import {
  agoLabel, failedTriesLabel, failureCopy, isOverdue, LISTING_TABS, listingTab, livePage, payoutProblemSince, shortId, usd, waitLabel,
  type ApiFailedPayment, type ApiListing, type ApiMarketplaceOrder, type ApiPage,
} from "@/lib/marketplace-ops-live";
import { ORG_TYPE_COPY, type ApiOnboarding } from "@/lib/onboarding-live";
import { payeeKind, type ApiAdminPayout } from "@/lib/payouts-live";
import { apiFetch } from "@/server/api";
import { retryPayoutAction } from "@/app/(app)/admin/payouts/actions";

/* --------------------------------------------------------------------------
   Marketplace operations — 2S7-FE-02. Every marketplace exception BTG acts
   on, in one place. BTG_ADMIN and SUPER_ADMIN.

   Reads, in parallel:
     GET /onboarding                                  (PENDING_REVIEW, the API's default)
     GET /listings?state=PENDING_APPROVAL             listings HELD for BTG, with their reasons
                                                      (decided inline: POST /listings/:id/decision)
     GET /listings/auto-published                     2S3-FE-04 — the last 30 days' listings that went
                                                      live on their own (2S3-BE-06), newest first;
                                                      POST /listings/:id/btg-action pauses or ends one
                                                      with a reason the seller is emailed
     GET /listings/live?page=N                        2S3-FE-04 — every live listing in BTG's tenants,
                                                      however it went live, newest first, 25 a page:
                                                      the same Pause / End, so BTG can act on ANY
                                                      live listing, not only the last 30 days'
                                                      automatic ones
                                                      (?listings=held | auto | live picks the tab;
                                                      ?page= pages the live one)
     GET /marketplace-orders?state=PENDING_APPROVAL   (each opens /admin/marketplace/orders/<id>)
     GET /payments/failed                             orders still owing whose latest card
                                                      payment failed (each opens the order:
                                                      cancel, or mark paid another way)
     GET /payouts?state=FAILED                        payouts the provider couldn't send
   Writes POST /payouts/:id/retry                     (the payout desk's own retry action)
   Counts are the lengths of those arrays — the API has no counts route.

   Honest gaps: disputes have no model or route yet — they arrive with
   2S5-BE-03 (refunds and disputes), so that section says so and shows no
   number. A refund is marked by hand on the order (Mark refunded); nothing
   asks BTG for one yet. Held orders carry only sponsorId — no sponsor name.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/admin/marketplace";

type Queue<T> = { rows: T[] } | { forbidden: true };

async function read<T>(path: string, key: string): Promise<Queue<T>> {
  const res = await apiFetch(path);
  if (res.status === 403) return { forbidden: true };
  if (!res.ok) throw new Error(`The console couldn't load ${path} (${res.status}).`);
  return { rows: ((await res.json()) as Record<string, T[]>)[key] ?? [] };
}

const countOf = (q: Queue<unknown>) => ("rows" in q ? String(q.rows.length) : "—");

type Paged<T> = { rows: T[]; page: ApiPage } | { forbidden: true };

/** GET /listings/live — one page, with the API's page block. */
async function readLive(page: number): Promise<Paged<ApiListing>> {
  const res = await apiFetch(`/listings/live?page=${page}`);
  if (res.status === 403) return { forbidden: true };
  if (!res.ok) throw new Error(`The console couldn't load /listings/live (${res.status}).`);
  const d = (await res.json()) as { listings?: ApiListing[]; page: ApiPage };
  return { rows: d.listings ?? [], page: d.page };
}

const HINT: Record<"held" | "auto" | "live", string> = {
  held: "A listing goes live on its own when its checks pass. These were flagged — the reasons are below. Approving puts it live; blockers must be cleared by the seller first.",
  auto: "Went live on their own in the last 30 days, newest first. Pause or end one with a reason — the seller is emailed it, and only BTG puts a listing it paused back live.",
  live: "Every listing on sale now, however it went live, newest first. Pause or end any of them with a reason — the seller is emailed it.",
};

function Pager({ page }: { page: ApiPage }) {
  if (page.pages <= 1) return null;
  const href = (n: number) => `${PATH}?listings=live&page=${n}#listings`;
  return (
    <nav aria-label="Live listings pages" className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft px-5 py-3 text-xs">
      {page.page > 1 ? (
        <Link href={href(page.page - 1)} className="text-primary hover:underline">
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="tabular-nums text-muted">
        Page {page.page} of {page.pages} · {page.total} live
      </span>
      {page.page < page.pages ? (
        <Link href={href(page.page + 1)} className="text-primary hover:underline">
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function Forbidden() {
  return <p className="px-5 py-4 text-xs text-muted">Outside your role — the API refused this queue.</p>;
}
function Clear({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-4 text-xs text-faint">{children}</p>;
}

export default async function MarketplaceOpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Marketplace operations" roles={lacking} />;
  const sp = await searchParams;
  const tab = listingTab(sp.listings);

  const [onboarding, listings, autoPublished, live, orders, payments, payouts] = await Promise.all([
    read<ApiOnboarding>("/onboarding", "onboardings"),
    read<ApiListing>("/listings?state=PENDING_APPROVAL", "listings"),
    read<ApiListing>("/listings/auto-published", "listings"),
    readLive(tab === "live" ? livePage(sp.page) : 1),
    read<ApiMarketplaceOrder>("/marketplace-orders?state=PENDING_APPROVAL", "orders"),
    read<ApiFailedPayment>("/payments/failed", "payments"),
    read<ApiAdminPayout>("/payouts?state=FAILED", "payouts"),
  ]);
  const now = new Date().getTime();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Marketplace operations</h1>
          <p className="mt-1 text-xs text-muted">Every exception in one place. Act on it here; each action is recorded against the reviewer.</p>
        </div>
        <Link href="/admin/commission" className="text-xs text-primary hover:underline">
          Commission rules →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Properties awaiting review" value={countOf(onboarding)} />
        <StatTile label="Listings held for BTG" value={countOf(listings)} />
        <StatTile label="Listings live automatically (30 days)" value={countOf(autoPublished)} />
        <StatTile label="Orders awaiting approval" value={countOf(orders)} />
        <StatTile label="Failed payments" value={countOf(payments)} />
        <StatTile label="Payout problems" value={countOf(payouts)} />
      </div>

      <Card className="p-0">
        <div className="px-5 pt-4">
          <SectionHeading
            title="Property applications"
            hint="Submitted and waiting for BTG, oldest first."
            action={
              <Link href="/admin/onboarding" className="text-[11px] text-primary hover:underline">
                All applications →
              </Link>
            }
          />
        </div>
        {"forbidden" in onboarding ? (
          <Forbidden />
        ) : onboarding.rows.length === 0 ? (
          <Clear>Nothing waiting — new applications arrive here when an organisation submits the wizard.</Clear>
        ) : (
          <ul className="divide-y divide-line-soft">
            {onboarding.rows.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/onboarding/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{o.orgName}</span>
                    <span className="block text-[11px] text-muted">
                      {ORG_TYPE_COPY[o.orgType]?.label ?? o.orgType}
                      {o.stateCode ? ` · ${o.stateCode}` : ""}
                    </span>
                  </span>
                  <span className={`text-[11px] tabular-nums ${isOverdue(o.submittedAt, now) ? "text-warn" : "text-faint"}`}>
                    waiting {waitLabel(o.submittedAt, now) ?? "—"} · Review →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <div id="listings" className="space-y-3 px-5 pt-4">
          <SectionHeading title="Listings" hint={HINT[tab]} />
          <nav aria-label="Listing desks" className="flex flex-wrap gap-2 pb-1">
            {LISTING_TABS.map((t) => {
              const on = t.key === tab;
              const n = t.key === "live" ? ("page" in live ? String(live.page.total) : "—") : countOf(t.key === "held" ? listings : autoPublished);
              return (
                <Link
                  key={t.key}
                  href={`${PATH}?listings=${t.key}#listings`}
                  aria-current={on ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${on ? "border-primary/60 text-primary" : "border-line text-muted hover:text-text"}`}
                >
                  {t.label}
                  <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${t.key === "held" && n !== "0" && n !== "—" ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>{n}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        {tab === "held" ? (
          "forbidden" in listings ? (
            <Forbidden />
          ) : listings.rows.length === 0 ? (
            <Clear>Nothing held — every listing submitted lately passed its checks and went live.</Clear>
          ) : (
            <MopsListingQueue listings={listings.rows} now={now} />
          )
        ) : tab === "live" ? (
          "forbidden" in live ? (
            <Forbidden />
          ) : live.rows.length === 0 ? (
            <Clear>
              {live.page.total > 0 ? (
                <Link href={`${PATH}?listings=live#listings`} className="text-primary hover:underline">
                  Nothing on this page — back to the first page
                </Link>
              ) : (
                "No listings are live right now."
              )}
            </Clear>
          ) : (
            <>
              <MopsAutoPublishedList listings={live.rows} now={now} />
              <Pager page={live.page} />
            </>
          )
        ) : "forbidden" in autoPublished ? (
          <Forbidden />
        ) : autoPublished.rows.length === 0 ? (
          <Clear>No listings went live automatically in the last 30 days.</Clear>
        ) : (
          <MopsAutoPublishedList listings={autoPublished.rows} now={now} />
        )}
      </Card>

      <Card className="p-0">
        <div className="px-5 pt-4">
          <SectionHeading title="Orders awaiting approval" hint="Only orders above the sponsor's spending limit wait for BTG — the rest are approved on their own. Open one to see the limit and decide." />
        </div>
        {"forbidden" in orders ? (
          <Forbidden />
        ) : orders.rows.length === 0 ? (
          <Clear>No orders held for approval.</Clear>
        ) : (
          <ul className="divide-y divide-line-soft">
            {orders.rows.map((o) => (
              <li key={o.id}>
                <Link href={`${PATH}/orders/${o.id}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      Order {shortId(o.id)} · <span className="tabular-nums">{usd(o.totalCents)}</span>
                    </span>
                    <span className="block text-[11px] text-muted">
                      {o.lines.length} line{o.lines.length === 1 ? "" : "s"}
                      {o.lines[0] ? ` · ${o.lines[0].title}${o.lines.length > 1 ? " and more" : ""}` : ""}
                    </span>
                    {o.approvalReasons.length > 0 && <span className="mt-0.5 block text-[11px] text-warn">Held: {o.approvalReasons.join("; ")}</span>}
                  </span>
                  <span className={`text-[11px] tabular-nums ${isOverdue(o.createdAt, now) ? "text-warn" : "text-faint"}`}>
                    waiting {waitLabel(o.createdAt, now) ?? "—"} · Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <div className="px-5 pt-4">
          <SectionHeading
            title="Failed payments"
            hint="The sponsor's latest card payment didn't go through. They can pay again from their order; open one to cancel it, or mark it paid if they paid another way."
          />
        </div>
        {"forbidden" in payments ? (
          <Forbidden />
        ) : payments.rows.length === 0 ? (
          <Clear>No failed payments right now.</Clear>
        ) : (
          <ul className="divide-y divide-line-soft">
            {payments.rows.map((p) => (
              <li key={p.orderId}>
                <Link href={`${PATH}/orders/${p.orderId}`} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      Order {p.orderRef} · <span className="tabular-nums">{usd(p.amountCents)}</span>
                    </span>
                    <span className="block text-[11px] text-muted">
                      {p.sponsorName} · {failedTriesLabel(p.failedTries)}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-danger">{failureCopy(p.failureReason)}</span>
                  </span>
                  <span className={`text-[11px] tabular-nums ${isOverdue(p.failedAt, now) ? "text-warn" : "text-faint"}`}>
                    failed {agoLabel(p.failedAt, now)} · Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-0">
        <div className="px-5 pt-4">
          <SectionHeading
            title="Payout problems"
            hint="The payment provider couldn't send these. Retry hands one back to the provider — ask the payee to update their payout account on Stripe first when that's the problem."
            action={
              <Link href="/admin/payouts?tab=problems" className="text-[11px] text-primary hover:underline">
                Payout approvals →
              </Link>
            }
          />
        </div>
        {"forbidden" in payouts ? (
          <Forbidden />
        ) : payouts.rows.length === 0 ? (
          <Clear>No payout problems.</Clear>
        ) : (
          <ul className="divide-y divide-line-soft">
            {payouts.rows.map((p) => (
              <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                <span className="min-w-0">
                  <Link href={`/admin/payouts/${p.id}`} className="block text-sm font-medium hover:underline">
                    {p.payeeName} · <span className="tabular-nums">{usd(p.amountCents)}</span>
                  </Link>
                  <span className="block text-[11px] text-muted">
                    {payeeKind(p.payeeType)}
                    {p.lines.length > 0 ? ` · ${p.lines.map((l) => l.orderRef).join(", ")}` : ""}
                    {` · updated ${agoLabel(payoutProblemSince(p), now)}`}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-danger">Couldn&rsquo;t send: {failureCopy(p.failureReason)}</span>
                </span>
                <PayoutRetry retry={retryPayoutAction.bind(null, p.id)} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionHeading title="Disputes" />
        <p className="text-xs text-muted">
          Not tracked yet — disputes arrive with refunds and disputes (2S5-BE-03), which waits on the payment provider&rsquo;s live webhooks. Nothing is counted here until then. A refund is marked by hand today: open the order and choose Mark refunded.
        </p>
      </Card>
    </div>
  );
}
