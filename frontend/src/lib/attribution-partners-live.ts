/* --------------------------------------------------------------------------
   POL-FE-74 — Attribution's commerce partners (3S6-BE-01).

     GET  /intelligence/attribution/partners   the adapters, and this tenant's
                                               partners with their deliveries
     POST /intelligence/attribution/partners   { name, adapter } — BTG admins;
                                               the token comes back ONCE

   Pure: the shapes, the add form's check, and who may add.
   -------------------------------------------------------------------------- */

export type ApiAdapter = { key: string; name: string; methods: string[]; lookbackDays: number; matchKeys: string[]; intake: string };
export type ApiPartner = {
  id: string; name: string; adapter: string; enabled: boolean; createdAt: string;
  deliveries: number; rejected: number; events: number; lastDeliveryAt: string | null;
};
export type ApiPartnerDesk = { adapters: ApiAdapter[]; partners: ApiPartner[] };
export type AddedPartner = { partner: { id: string; name: string; adapter: string }; token: string; endpoint: string };

/** The API lets BTG admins add a partner (attribution write, tenant-wide). */
export const PARTNER_ADD_ROLES = ["SUPER_ADMIN", "BTG_ADMIN"];
export const mayAddPartner = (roles: readonly string[]) => roles.some((r) => PARTNER_ADD_ROLES.includes(r));

/** Why "Add partner" can't go yet, or null. */
export function partnerProblem(name: string, adapter: string, adapters: readonly Pick<ApiAdapter, "key">[]): string | null {
  const n = name.trim();
  if (n.length < 2 || n.length > 120) return "Name the partner (2 to 120 characters).";
  if (!adapters.some((a) => a.key === adapter)) return "Pick how the partner sends sales.";
  return null;
}

/** One partner's line: deliveries, events, rejections, the last delivery. */
export function partnerLine(p: ApiPartner): string {
  if (p.deliveries === 0) return "Nothing received yet.";
  const parts = [`${p.deliveries} ${p.deliveries === 1 ? "delivery" : "deliveries"}`, `${p.events} ${p.events === 1 ? "sale" : "sales"}`];
  if (p.rejected) parts.push(`${p.rejected} rejected`);
  return parts.join(" · ");
}
