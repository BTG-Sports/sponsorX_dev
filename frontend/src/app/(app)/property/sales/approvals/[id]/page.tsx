import { SellerApprovalDetail, SellerApprovalMissing } from "@/components/seller-approval";
import type { ApiSellerApproval } from "@/lib/order-automation-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   An order to approve (the team's side) — 2S4-FE-05 (Claude Design
   SellerOrderActions.dc.html, who = hawks: approve · accept · decline ·
   accepted · declined · expired). The link the "approve this order" email
   carries (2S4-BE-09, order-mail approvalPath).

   Reads  GET  /seller-approvals/:id            (own approval only)
   Writes POST /seller-approvals/:id/decision   (seller-sales-actions.ts)
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertySaleApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("property");
  const { id } = await params;
  const res = await apiFetch(`/seller-approvals/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) return <SellerApprovalMissing kind="team" />;
  if (!res.ok) throw new Error(`Order unavailable (${res.status}).`);
  return <SellerApprovalDetail kind="team" approval={(await res.json()) as ApiSellerApproval} now={new Date()} />;
}
