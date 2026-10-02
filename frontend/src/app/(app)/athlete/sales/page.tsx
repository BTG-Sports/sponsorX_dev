import { SellerOrdersList } from "@/components/seller-orders";
import { EmptyState } from "@/components/states";
import { demoState } from "@/lib/demo";
import { approvalsToList, type ApiSellerApproval } from "@/lib/order-automation-live";
import type { ApiSellerOrder } from "@/lib/seller-orders-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Orders (the athlete's sales) — 2S4-FE-03 and the seller half of 2S4-FE-04
   (Claude Design Orders.dc.html, who = riley, list view). Every marketplace
   sale of the athlete's items — sold by them, or by their team — with their
   own share only.

   Not /athlete/orders: that route is Phase 1's Campaign Orders.

   Reads  GET /seller-approvals  orders the seller's listings ask them to
                                  approve, not yet sales (2S4-FE-05 / BE-09)
          GET /sales   the caller's own sold lines and own share; the
                       sponsor's contact only once paid (2S4-BE-06)
   ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteSalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("athlete");
  const demo = await demoState(searchParams);
  if (demo) return <SellerOrdersList kind="athlete" orders={[]} demo={demo} />;
  const [res, appRes] = await Promise.all([apiFetch("/sales"), apiFetch("/seller-approvals").catch(() => null)]);
  if (res.status === 403) {
    return <EmptyState mark="inbox" title="No athlete profile is linked to this login" hint="Your sales show here once your login is linked to your athlete profile." />;
  }
  if (!res.ok) return <SellerOrdersList kind="athlete" orders={[]} demo="error" />;
  const { sales } = (await res.json()) as { sales: ApiSellerOrder[] };
  /* 2S4-FE-05 — a failed approvals read hides that list, never the page. */
  const approvals = appRes?.ok ? approvalsToList(((await appRes.json()) as { approvals: ApiSellerApproval[] }).approvals) : [];
  return <SellerOrdersList kind="athlete" orders={sales} approvals={approvals} now={new Date()} demo={null} />;
}
