import { redirect } from "next/navigation";

import { fetchActor } from "@/server/api";
import { payoutHomeFor } from "@/server/payout-link";

/* --------------------------------------------------------------------------
   POL-FE-73 — the link in "Payout needs review" and "Payout failed" emails.
   Those go to Finance and to BTG admins alike, so the link names no portal:
   this page sends each reader to the payout in their own workspace. Finance
   used to land on /admin/payouts/<id>, which bounced them home.
   -------------------------------------------------------------------------- */

export default async function PayoutLinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await fetchActor();
  if (who.status === "anonymous") redirect("/login");
  if (who.status !== "linked") redirect("/portal");
  redirect(payoutHomeFor(who.actor.roles, id));
}
