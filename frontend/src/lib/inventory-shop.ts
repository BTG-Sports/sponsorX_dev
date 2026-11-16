import { fmtDay, kindLabel, usd, type ApiInventoryItem, type InventoryCounts } from "./inventory-live";
import { textParam, type SearchParams } from "./list-query";

/* --------------------------------------------------------------------------
   POL-FE-83 — the athlete's inventory redrawn as a shop window
   (/athlete/inventory). Plain words for every item card, worked out on the
   server from the API's own item, so the client island only draws:

     · stock    "5 in stock" / "Only 2 left" / "Sold out" / "No limit"
     · when     "Any time" / "Opens Dec 3, 2026" / "Until …" / "Ended …"
                (dates are UTC days, as the form saves them, compared as
                days, so the last day still reads "Until", not "Ended")
     · a bundle what a package holds (its items' titles)

   And the tabs over the list: All / On sale / Paused / Not listed yet. Each
   is one URL state the API already filters on (?active, ?unlisted), and the
   counts are the API's whole-scope `counts` — never the page's rows (memory:
   stats-must-be-retrievable). "Not listed yet" only shows while the API
   counts it.
   -------------------------------------------------------------------------- */

export type StockTone = "ok" | "low" | "out" | "open";
export type WhenTone = "any" | "now" | "soon" | "ended";

export type ShopCard = {
  id: string;
  title: string;
  /** The API's kind (SOCIAL_POST…), for the glyph and the colour. */
  kind: string;
  kindLabel: string;
  price: string;
  stock: { label: string; tone: StockTone };
  when: { label: string; tone: WhenTone };
  /** The description's first line or so; null when there is none. */
  blurb: string | null;
  /** A package's contents; null for a single item. */
  bundle: { count: number; names: string[] } | null;
  active: boolean;
};

/** "Only n left" from here down. */
export const LOW_STOCK = 3;
const BLURB_MAX = 120;

export function stockOf(quantity: number | null): ShopCard["stock"] {
  if (quantity === null) return { label: "No limit", tone: "open" };
  if (quantity <= 0) return { label: "Sold out", tone: "out" };
  if (quantity <= LOW_STOCK) return { label: `Only ${quantity} left`, tone: "low" };
  return { label: `${quantity} in stock`, tone: "ok" };
}

export function whenOf(from: string | null, until: string | null, now: number): ShopCard["when"] {
  const today = new Date(now).toISOString().slice(0, 10);
  if (until && until.slice(0, 10) < today) return { label: `Ended ${fmtDay(until)}`, tone: "ended" };
  if (from && from.slice(0, 10) > today) return { label: `Opens ${fmtDay(from)}`, tone: "soon" };
  if (until) return { label: `Until ${fmtDay(until)}`, tone: "now" };
  return { label: "Any time", tone: "any" };
}

export function blurbOf(description: string | null): string | null {
  const text = (description ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > BLURB_MAX ? `${text.slice(0, BLURB_MAX - 1).trimEnd()}…` : text;
}

export function shopCard(i: ApiInventoryItem, now: number): ShopCard {
  const parts = i.kind === "PACKAGE" ? (i.components ?? []) : [];
  return {
    id: i.id,
    title: i.title,
    kind: i.kind,
    kindLabel: kindLabel(i.kind),
    price: usd(i.priceCents),
    stock: stockOf(i.quantity),
    when: whenOf(i.availableFrom, i.availableUntil, now),
    blurb: blurbOf(i.description),
    bundle: i.kind === "PACKAGE" ? { count: parts.length, names: parts.map((c) => c.component.title) } : null,
    active: i.active,
  };
}

/* ── the tabs ──────────────────────────────────────────────────────────── */

export type ShopTab = "all" | "on" | "paused" | "unlisted";

/** Which tab the URL is on. ?unlisted wins over ?active; the tabs never set both. */
export function shopTab(sp: SearchParams): ShopTab {
  if (textParam(sp, "unlisted", ["true"])) return "unlisted";
  const active = textParam(sp, "active", ["true", "false"]);
  return active === "true" ? "on" : active === "false" ? "paused" : "all";
}

/** What the API is asked for, per tab. */
export function tabQuery(tab: ShopTab): { active: string; unlisted: string } {
  return {
    active: tab === "on" ? "true" : tab === "paused" ? "false" : "",
    unlisted: tab === "unlisted" ? "true" : "",
  };
}

/** The URL change a tab makes (null drops the key). */
export function tabPatch(tab: ShopTab): Record<string, string | null> {
  const q = tabQuery(tab);
  return { active: q.active || null, unlisted: q.unlisted || null };
}

export type TabDef = { key: ShopTab; label: string; count: number };

export function shopTabs(counts: InventoryCounts): TabDef[] {
  const tabs: TabDef[] = [
    { key: "all", label: "All items", count: counts.total },
    { key: "on", label: "On sale", count: counts.active },
    { key: "paused", label: "Paused", count: counts.paused },
  ];
  if (counts.unlisted !== null) tabs.push({ key: "unlisted", label: "Not listed yet", count: counts.unlisted });
  return tabs;
}
