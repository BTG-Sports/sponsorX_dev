import Link from "next/link";

import { MarketplaceDesk, type DeskData, type LiveQueue, type Queue } from "@/components/marketplace-desk";
import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { firstBusyQueue, listingTab, livePage, queueKey, type ApiFailedPayment, type ApiListing, type ApiMarketplaceOrder, type ApiPage } from "@/lib/marketplace-ops-live";
import type { ApiOnboarding } from "@/lib/onboarding-live";
import type { ApiAdminPayout } from "@/lib/payouts-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Marketplace operations — 2S7-FE-02. Every marketplace exception BTG acts
   on, in one place. BTG_ADMIN and SUPER_ADMIN.

   P1-ART-20 (2026-10-07): restructured as the marketplace desk — a queue
   strip of five tiles (the counts, with context), the picked queue's rows
   under it as one panel (components/marketplace-desk.tsx). The page still
   reads every queue in one parallel pass; switching queues reads nothing.

   Reads, in parallel:
     GET /onboarding?state=PENDING_REVIEW&page=1&size=12   the oldest 12 waiting, with the API's count
     GET /listings?state=PENDING_APPROVAL             listings HELD for BTG, with their reasons
                                                      (decided inline: POST /listings/:id/decision)
     GET /listings/auto-published                     2S3-FE-04 — the last 30 days' listings that went
                                                      live on their own (2S3-BE-06), newest first;
                                                      POST /listings/:id/btg-action pauses or ends one
     GET /listings/live?page=N                        2S3-FE-04 — every live listing, 25 a page
                                                      (?listings=held | auto | live picks the tab;
                                                      ?page= pages the live one; ?queue= picks the queue)
     GET /marketplace-orders?state=PENDING_APPROVAL   (each opens /admin/marketplace/orders/<id>)
     GET /payments/failed                             orders still owing whose latest card
                                                      payment failed (each opens the order)
     GET /payouts?state=FAILED&waitingOn=BTG&page=1&size=12   payouts the provider couldn't send,
                                                      left for BTG, with the API's count
   Writes POST /payouts/:id/retry                     (the payout desk's own retry action)

   Honest gaps: disputes have no model or route yet — they arrive with
   2S5-BE-03 (refunds and disputes), so the desk says so under the strip.
   Held orders carry only sponsorId — no sponsor name.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/admin/marketplace";

async function read<T>(path: string, key: string): Promise<Queue<T>> {
  const res = await apiFetch(path);
  if (res.status === 403) return { forbidden: true };
  if (!res.ok) throw new Error(`The console couldn't load ${path} (${res.status}).`);
  const d = (await res.json()) as Record<string, unknown> & { page?: ApiPage };
  const rows = (d[key] as T[] | undefined) ?? [];
  return { rows, total: d.page?.total ?? rows.length };
}

/** GET /listings/live — one page, with the API's page block. */
async function readLive(page: number): Promise<LiveQueue> {
  const res = await apiFetch(`/listings/live?page=${page}`);
  if (res.status === 403) return { forbidden: true };
  if (!res.ok) throw new Error(`The console couldn't load /listings/live (${res.status}).`);
  const d = (await res.json()) as { listings?: ApiListing[]; page: ApiPage };
  return { rows: d.listings ?? [], page: d.page };
}

const total = (q: Queue<unknown>) => ("forbidden" in q ? null : q.total);

export default async function MarketplaceOpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title="Marketplace operations" roles={lacking} />;
  const sp = await searchParams;
  const tab = listingTab(sp.listings);

  const [applications, held, auto, live, orders, payments, payouts] = await Promise.all([
    read<ApiOnboarding>("/onboarding?state=PENDING_REVIEW&page=1&size=12", "onboardings"),
    read<ApiListing>("/listings?state=PENDING_APPROVAL", "listings"),
    read<ApiListing>("/listings/auto-published", "listings"),
    readLive(tab === "live" ? livePage(sp.page) : 1),
    read<ApiMarketplaceOrder>("/marketplace-orders?state=PENDING_APPROVAL", "orders"),
    read<ApiFailedPayment>("/payments/failed", "payments"),
    /* 2S5-FE-06 — only the failed payouts that need BTG: the rest retry on their own or wait for the payee. */
    read<ApiAdminPayout>("/payouts?state=FAILED&waitingOn=BTG&page=1&size=12", "payouts"),
  ]);
  const data: DeskData = { applications, held, auto, live, orders, payments, payouts };
  const queue = queueKey(sp.queue, sp.listings) ?? firstBusyQueue({
    applications: total(applications), listings: total(held), orders: total(orders), payments: total(payments), payouts: total(payouts),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="sx-page-title">Marketplace operations</h1>
          <p className="mt-1 text-xs text-muted">Every exception in one place. Act on it here; each action is recorded against the reviewer.</p>
        </div>
        <Link href="/admin/commission" className="text-xs font-semibold text-primary-soft hover:underline">
          Commission rules →
        </Link>
      </div>

      <MarketplaceDesk data={data} queue={queue} tab={tab} now={new Date().getTime()} />
    </div>
  );
}
