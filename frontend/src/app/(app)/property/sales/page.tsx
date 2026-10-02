import { SellerOrdersList } from "@/components/seller-orders";
import { EmptyState } from "@/components/states";
import { demoState } from "@/lib/demo";
import { approvalsToList, type ApiSellerApproval } from "@/lib/order-automation-live";
import type { ApiSellerOrder } from "@/lib/seller-orders-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Orders (the team's sales) — 2S4-FE-03 and the seller half of 2S4-FE-04
   (Claude Design Orders.dc.html, who = hawks, list view). Every marketplace
   sale the team made, with the team's own share only — each athlete's
   share is on their own Orders page.

   Reads  GET /seller-approvals  orders the seller's listings ask them to
                                  approve, not yet sales (2S4-FE-05 / BE-09)
          GET /sales   the team's own sold lines and own share; the
                       sponsor's contact only once paid (2S4-BE-06)
   ?demo=loading|empty|error renders the branded states.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertySalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortalAccess("property");
  const demo = await demoState(searchParams);
  if (demo) return <SellerOrdersList kind="team" orders={[]} demo={demo} />;
  const [res, appRes] = await Promise.all([apiFetch("/sales"), apiFetch("/seller-approvals").catch(() => null)]);
  if (res.status === 403) {
    return <EmptyState mark="inbox" title="No property is linked to this login" hint="The team's sales belong to its manager. Ask BTG to link your login to your team." />;
  }
  if (!res.ok) return <SellerOrdersList kind="team" orders={[]} demo="error" />;
  const { sales } = (await res.json()) as { sales: ApiSellerOrder[] };
  /* 2S4-FE-05 — a failed approvals read hides that list, never the page. */
  const approvals = appRes?.ok ? approvalsToList(((await appRes.json()) as { approvals: ApiSellerApproval[] }).approvals) : [];
  return <SellerOrdersList kind="team" orders={sales} approvals={approvals} now={new Date()} demo={null} />;
}
