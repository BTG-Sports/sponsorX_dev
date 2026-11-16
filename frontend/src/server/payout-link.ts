import { canOpenPortal } from "@/server/portal";

/** POL-FE-73 — where a payout email's link takes this reader: BTG admins to
 *  Admin, Finance to its own payout page, anyone else to their portal. */
export function payoutHomeFor(roles: readonly string[], id: string): string {
  const safe = encodeURIComponent(id);
  if (canOpenPortal(roles, "admin")) return `/admin/payouts/${safe}`;
  if (canOpenPortal(roles, "finance")) return `/finance/payouts/${safe}`;
  return "/portal";
}
