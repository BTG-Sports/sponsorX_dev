import { SellerApprovalDetail, SellerApprovalMissing } from "@/components/seller-approval";
import type { ApiSellerApproval } from "@/lib/order-automation-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   An order to approve (the athlete's side) — 2S4-FE-05 (Claude Design
   SellerOrderActions.dc.html, who = riley: approve · accept · decline ·
   accepted · declined · expired). The link the "approve this order" email
   carries (2S4-BE-09, order-mail approvalPath).

   Reads  GET  /seller-approvals/:id            (own approval only)
   Writes POST /seller-approvals/:id/decision   (seller-sales-actions.ts)

   P1-ART-22 (2026-10-11) — the title row is the Arena's (OrdersHead in
   seller-orders.tsx, through SellerApprovalDetail / SellerApprovalMissing).
   Visual only — the read and the write above are unchanged.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteSaleApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;
  const res = await apiFetch(`/seller-approvals/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) return <SellerApprovalMissing kind="athlete" />;
  if (!res.ok) throw new Error(`Order unavailable (${res.status}).`);
  return <SellerApprovalDetail kind="athlete" approval={(await res.json()) as ApiSellerApproval} now={new Date()} />;
}
