/* --------------------------------------------------------------------------
   The property portal's live reads — P2-FE-01, §8 PROPERTY_MGR.

   GET /properties/mine answers "which property is mine" (whereFor, the
   actor's own property link). The roster and the inventory are two
   SERVER-PAGED lists (2026-09-29): GET /team/athletes and GET /team/inventory,
   each one page plus its DB counts, own-property scoped — the portal no
   longer reads every athlete with every item nested and flattens it here.
   The roster pages on ?page/?size/?q, the inventory on ?ipage/?isize/?iq so
   the two lists keep their own place.

   Null for anyone who isn't a PROPERTY_MGR (the page's cue for the demo);
   "unlinked" for a PROPERTY_MGR with no property yet. No catch: an outage is
   an error page, never a sample property's figures.
   -------------------------------------------------------------------------- */
import { apiFetch, fetchActor } from "@/server/api";
import { pageParams, pageParamsFor, textParam, type ListKeys, type PageInfo, type SearchParams } from "@/lib/list-query";

export const INVENTORY_KEYS: ListKeys = { page: "ipage", size: "isize" };

export type ApiOwnProperty = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  city: string | null;
  stateCode: string | null;
};

export type ApiTeamItem = {
  id: string;
  title: string;
  kind: string;
  /** cents */
  priceCents: number;
  /** null = unlimited */
  quantity: number | null;
  availableFrom: string | null;
  availableUntil: string | null;
  active: boolean;
  version: number;
  /** The athlete who sells it; null when the team (the property) does. */
  owner: string | null;
};

export type ApiTeamAthlete = {
  id: string;
  displayName: string;
  sport: string;
  position: string | null;
  gradYear: number | null;
  state: string;
  teamShareBps: number | null;
};

export type LiveProperty = {
  property: ApiOwnProperty;
  athletes: ApiTeamAthlete[];
  athletePage: PageInfo;
  athleteCounts: { athletes: number; active: number };
  inventory: ApiTeamItem[];
  inventoryPage: PageInfo;
  inventoryCounts: { items: number; active: number };
  q: string;
  iq: string;
};

async function json<T>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`${path.split("?")[0]} unavailable (${res.status}).`);
  return (await res.json()) as T;
}

export async function liveProperty(sp: SearchParams): Promise<LiveProperty | "unlinked" | null> {
  const who = await fetchActor();
  if (who.status !== "linked") return null;
  if (!who.actor.roles.includes("PROPERTY_MGR")) return null;
  if (!who.actor.propertyId) return "unlinked";

  const a = pageParams(sp);
  const i = pageParamsFor(sp, INVENTORY_KEYS);
  const q = textParam(sp, "q");
  const iq = textParam(sp, "iq");
  const aq = new URLSearchParams({ page: String(a.page), size: String(a.size), ...(q ? { q } : {}) });
  const iqs = new URLSearchParams({ page: String(i.page), size: String(i.size), ...(iq ? { q: iq } : {}) });

  const [mine, team, inv] = await Promise.all([
    json<{ property: ApiOwnProperty }>("/properties/mine"),
    json<{ athletes: ApiTeamAthlete[]; page: PageInfo; counts: LiveProperty["athleteCounts"] }>(`/team/athletes?${aq}`),
    json<{ inventory: ApiTeamItem[]; page: PageInfo; counts: LiveProperty["inventoryCounts"] }>(`/team/inventory?${iqs}`),
  ]);
  return {
    property: mine.property,
    athletes: team.athletes,
    athletePage: team.page,
    athleteCounts: team.counts,
    inventory: inv.inventory,
    inventoryPage: inv.page,
    inventoryCounts: inv.counts,
    q,
    iq,
  };
}
