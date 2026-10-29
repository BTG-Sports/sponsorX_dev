/* --------------------------------------------------------------------------
   POL-FE-13 — the signed-in sponsor's invoices, one server page at a time.

   There is no per-sponsor invoice list a sponsor role may call
   (GET /earnings/invoices needs `earning` read, which the matrix gives BTG,
   Finance and athletes — not sponsors), so the page is paged BY CAMPAIGN:
   one server page of the sponsor's campaigns (GET /campaigns?page&size,
   newest first — the same read the Campaigns page makes), then each
   campaign's own invoices (GET /campaigns/:id/invoices, the Zoho mirror),
   read in parallel. The page says it counts campaigns, not invoices.

   Null for anyone who is not a linked sponsor (the page says so); a role
   that can read campaigns but not invoices gets `forbidden`.
   -------------------------------------------------------------------------- */
import type { ApiCampaignInvoice } from "@/lib/sponsor-invoices-live";
import { SPONSOR_ROLES, type ApiCampaign } from "@/lib/sponsor-live";
import { apiFetch, fetchActor } from "@/server/api";
import { fetchCampaignPage } from "@/server/campaigns";
import type { PageInfo, SearchParams } from "@/lib/list-query";

export type LiveInvoicePage =
  | { status: "ok"; campaigns: { id: string; name: string; invoices: ApiCampaignInvoice[] }[]; page: PageInfo }
  /** The role reads campaigns but the matrix withholds invoices (SPONSOR_* may; a BTG preview may not). */
  | { status: "forbidden" };

export async function liveSponsorInvoicePage(sp: SearchParams): Promise<LiveInvoicePage | null> {
  const who = await fetchActor();
  if (who.status !== "linked" || !who.actor.roles.some((r) => SPONSOR_ROLES.includes(r))) return null;

  /* Only the paging keys go through — a stray ?state or ?q from another
     page must not quietly narrow which campaigns' invoices are listed. */
  const pg = await fetchCampaignPage({ page: sp.page, size: sp.size });
  if (!pg) return null;
  const rows: ApiCampaign[] = pg.campaigns;
  if (rows.length > 0 && rows.every((r) => r.invoiced === undefined)) return { status: "forbidden" };

  const campaigns = await Promise.all(
    rows.map(async (c) => {
      const res = await apiFetch(`/campaigns/${encodeURIComponent(c.id)}/invoices`);
      /* A single campaign the matrix won't open is left empty, never the whole page. */
      if (res.status === 403 || res.status === 404) return { id: c.id, name: c.name, invoices: [] as ApiCampaignInvoice[] };
      if (!res.ok) throw new Error(`Invoices unavailable (${res.status}).`);
      const { invoices } = (await res.json()) as { invoices: ApiCampaignInvoice[] };
      return { id: c.id, name: c.name, invoices };
    }),
  );
  return { status: "ok", campaigns, page: pg.page };
}
