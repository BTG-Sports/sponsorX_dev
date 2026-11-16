import type { ApiAthleteListing } from "./athlete-listings-live";
import { categoryLabel, kindLabel, usd, type ApiInventoryItem, type BrandCategory } from "./inventory-live";
import { stockOf, whenOf, type ShopCard } from "./inventory-shop";

/* --------------------------------------------------------------------------
   POL-FE-83 — one inventory item as a showcase (/athlete/inventory/[id]).

   The owner: "the view page of that item must show like in the public
   profile of the athlete … it must have a public view also before the
   edit, the design must caught the attention of the sponsors". So the page
   opens on the item the way a sponsor meets it, and Edit is a button.

   Pure, so tests read it directly. Every line is a field of
   GET /inventory/:id, or a listing of it from GET /listings; nothing here
   estimates. What a sponsor never sees (the categories the item won't be
   sold to, its version) is split out as `private`, for the panel the page
   marks "Only you see this".
   -------------------------------------------------------------------------- */

/** One line per rule a sponsor should know before ordering. */
export function rulesLines(rules: Record<string, unknown> | null | undefined): string[] {
  if (!rules) return [];
  const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null);
  const min = n(rules.minQuantity);
  const max = n(rules.maxQuantity);
  const out: string[] = [];
  if (min && max) out.push(min === max ? `${min} per order` : `${min} to ${max} per order`);
  else if (min) out.push(`At least ${min} per order`);
  else if (max) out.push(`Up to ${max} per order`);
  if (rules.exclusive === true) out.push("Exclusive: one sponsor for any given dates");
  if (rules.requiresApproval === true) out.push("Each order is approved by the athlete first");
  if (rules.bundleOnly === true) out.push("Sold only as part of a package");
  return out;
}

const labels = (list: string[]) => list.map((c) => categoryLabel(c as BrandCategory));

export type Showcase = {
  title: string;
  kind: string;
  kindLabel: string;
  price: string;
  description: string | null;
  stock: ShopCard["stock"];
  when: ShopCard["when"];
  active: boolean;
  /** A package's contents, with how many of each. */
  bundle: Array<{ title: string; kindLabel: string; kind: string; quantity: number }>;
  /** Brand categories the athlete picked as a good fit. */
  fits: string[];
  rules: string[];
  private: { wontSellTo: string[]; version: number; updatedAt: string };
};

export function showcaseOf(i: ApiInventoryItem, now: number): Showcase {
  return {
    title: i.title,
    kind: i.kind,
    kindLabel: kindLabel(i.kind),
    price: usd(i.priceCents),
    description: i.description?.trim() || null,
    stock: stockOf(i.quantity),
    when: whenOf(i.availableFrom, i.availableUntil, now),
    active: i.active,
    bundle: (i.components ?? []).map((c) => ({ title: c.component.title, kind: c.component.kind, kindLabel: kindLabel(c.component.kind), quantity: c.quantity })),
    fits: labels(i.categories ?? []),
    rules: rulesLines(i.packageRules),
    private: { wontSellTo: labels(i.restrictedCategories ?? []), version: i.version, updatedAt: i.updatedAt },
  };
}

/* ── where sponsors can buy it ─────────────────────────────────────────── */

export type MarketStatus = {
  tone: "live" | "wait" | "off" | "team";
  /** One plain sentence. */
  label: string;
  /** The next step, when there is one the athlete can take. */
  action: { label: string; href: string } | null;
};

/**
 * Is the item on the marketplace? From the athlete's listings (GET /listings,
 * the legacy whole list — the same read /athlete/listings/new makes): the
 * item's live listing, else whether a team lists for them, else "not yet".
 */
export function marketStatus(itemId: string, listings: readonly ApiAthleteListing[], onTeam: boolean): MarketStatus {
  const l = listings.find((x) => x.inventoryItemId === itemId && x.state !== "ARCHIVED");
  if (l) {
    const team = l.seller.type === "PROPERTY";
    const open = team ? null : { label: "Open the listing", href: `/athlete/listings/${encodeURIComponent(l.id)}` };
    switch (l.state) {
      case "PUBLISHED":
        return { tone: "live", label: team ? `Live on the marketplace, listed by ${l.seller.name}` : "Live on the marketplace", action: open };
      case "PENDING_APPROVAL":
        return { tone: "wait", label: "Listed, and BTG is taking a look", action: open };
      case "PAUSED":
        return { tone: "off", label: "Listed, but the listing is paused", action: open };
      default:
        return { tone: "off", label: "A draft listing, not on the marketplace yet", action: open };
    }
  }
  if (onTeam) return { tone: "team", label: "Not on the marketplace yet. Your team lists your items.", action: null };
  return {
    tone: "off",
    label: "Not on the marketplace yet",
    action: { label: "List it", href: `/athlete/listings/new?item=${encodeURIComponent(itemId)}` },
  };
}
