import { redirect } from "next/navigation";

/* --------------------------------------------------------------------------
   POL-FE-11 — the address BTG's "closure held" email links to
   (account.closeHeldBtg's reviewUrl, backend/src/domain/account-closure.ts).
   The desk lives under /admin/closed-accounts; this only sends the email's
   link there.
   -------------------------------------------------------------------------- */

export default async function ClosureRequestEmailLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/closed-accounts/requests/${encodeURIComponent(id)}`);
}
