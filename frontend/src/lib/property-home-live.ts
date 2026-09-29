/* --------------------------------------------------------------------------
   P3-FE-07 — the property portal home, from the manager's own reads:

     GET /properties/mine   the property: name, kind, city, state
     GET /team/roster       its roster (with the team's share of each
                            athlete's earnings) and its inventory

   It replaced a sample property ("BTG Sports Talk") behind a demo banner.
   Inventory shows what the item row holds — active or paused, price,
   quantity; a listing's review status is the listing's, not shown here.
   -------------------------------------------------------------------------- */

export type ApiMyProperty = {
  property: { id: string; slug: string; name: string; kind: string; city: string | null; stateCode: string | null } | null;
};

export type ApiItem = {
  id: string;
  title: string;
  kind: string;
  priceCents: number;
  quantity: number | null;
  active: boolean;
};

export type ApiRoster = {
  property: { id: string; name: string; kind: string };
  athletes: { id: string; displayName: string; legalName: string; sport: string; state: string; teamShareBps: number | null; inventory: ApiItem[] }[];
  inventory: ApiItem[];
};

const KIND: Record<string, string> = { TEAM: "Team", SCHOOL: "School", EVENT: "Event", MEDIA: "Media", VIRTUAL: "Virtual" };

export function kindLabel(kind: string): string {
  return KIND[kind] ?? kind.charAt(0) + kind.slice(1).toLowerCase();
}

/** 2000 bps → "20%"; null → "Not set". */
export function shareLabel(bps: number | null): string {
  return bps === null ? "Not set" : `${Number((bps / 100).toFixed(2))}%`;
}

const mono = (s: string) => s.split(/\s+/).map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

export function buildPropertyHome(mine: ApiMyProperty, roster: ApiRoster | null) {
  const p = mine.property;
  const name = p?.name ?? roster?.property.name ?? "Your property";
  const athletes = (roster?.athletes ?? []).map((a) => ({
    id: a.id,
    name: a.legalName || a.displayName,
    mono: mono(a.legalName || a.displayName),
    sport: a.sport,
    share: shareLabel(a.teamShareBps),
    shareSet: a.teamShareBps !== null,
  }));
  const inventory = [
    ...(roster?.inventory ?? []),
    ...(roster?.athletes ?? []).flatMap((a) => a.inventory),
  ].map((i) => ({
    id: i.id,
    title: i.title,
    kind: i.kind.charAt(0) + i.kind.slice(1).toLowerCase().replace(/_/g, " "),
    qty: i.quantity === null ? "Open quantity" : `${i.quantity} available`,
    price: `$${(i.priceCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
    status: i.active ? "Active" : "Paused",
  }));
  return {
    name,
    mono: mono(name),
    kind: kindLabel(p?.kind ?? roster?.property.kind ?? ""),
    place: [p?.city, p?.stateCode].filter(Boolean).join(", "),
    athletes,
    inventory,
  };
}
