import type { ApiAthleteListing, ListCheck, ListableItem, ListingState } from "./athlete-listings-live";
import { fmtDay, kindLabel, usd } from "./inventory-live";
import { blurbOf, stockOf, type ShopCard } from "./inventory-shop";
import { textParam, type SearchParams } from "./list-query";

/* --------------------------------------------------------------------------
   POL-FE-84 — the athlete's listings redrawn like their inventory
   (/athlete/listings, after POL-FE-83). The owner: "the visual design is too
   much confusing, do like what we did in the inventory page".

   Plain words for every listing, worked out on the server from the API's
   own listing, so the client island only draws:

     · status  "Live on the marketplace" / "Goes live Dec 3, 2026" /
               "In review by BTG" / "Changes asked" / "Draft" / "Paused" /
               "Paused by BTG" / "Hidden while the item is paused" / "Ended"
               (a draft used to say "Not listed yet", the same words as an
               item with no listing at all)
     · note    one sentence on what it means and what to do next
     · switch  Live ↔ Paused for the seller's own published or paused
               listing (POST /listings/:id/transition, as the Pause and
               Resume buttons did); none for the rest

   And the tabs over the list: All / Live / In review / Drafts / Paused /
   Ended — the URL's `state` (the old filter's key and values, so old links
   still work), counted from the API's whole-scope `counts.byState`, never
   from the page's rows (memory: stats-must-be-retrievable).
   -------------------------------------------------------------------------- */

export type ListingTab = "all" | "live" | "review" | "draft" | "paused" | "ended";
export type ListingTone = "live" | "soon" | "wait" | "fix" | "off" | "none" | "ended";

const TAB_STATE: Record<Exclude<ListingTab, "all">, ListingState> = {
  live: "PUBLISHED",
  review: "PENDING_APPROVAL",
  draft: "DRAFT",
  paused: "PAUSED",
  ended: "ARCHIVED",
};
const TAB_LABEL: Record<ListingTab, string> = { all: "All", live: "Live", review: "In review", draft: "Drafts", paused: "Paused", ended: "Ended" };
const TAB_ORDER: ListingTab[] = ["all", "live", "review", "draft", "paused", "ended"];

/** Which tab the URL is on (`?state=PUBLISHED` …, the old filter's key). */
export function listingTab(sp: SearchParams): ListingTab {
  const s = textParam(sp, "state", Object.values(TAB_STATE));
  return (Object.keys(TAB_STATE) as Array<Exclude<ListingTab, "all">>).find((t) => TAB_STATE[t] === s) ?? "all";
}

/** The state the API is asked for; "" for All. */
export function tabState(tab: ListingTab): ListingState | "" {
  return tab === "all" ? "" : TAB_STATE[tab];
}

/** The URL change a tab makes (null drops the key). */
export function listingTabPatch(tab: ListingTab): Record<string, string | null> {
  return { state: tab === "all" ? null : TAB_STATE[tab] };
}

export type ListingTabDef = { key: ListingTab; label: string; count: number };

/** All, Live, then each other state that has any (or is the one open). */
export function listingTabs(byState: Partial<Record<ListingState, number>>, current: ListingTab): ListingTabDef[] {
  const n = (t: ListingTab) => (t === "all" ? Object.values(byState).reduce<number>((a, b) => a + (b ?? 0), 0) : (byState[TAB_STATE[t]] ?? 0));
  return TAB_ORDER.filter((t) => t === "all" || t === "live" || t === current || n(t) > 0).map((t) => ({ key: t, label: TAB_LABEL[t], count: n(t) }));
}

/* ── one listing ───────────────────────────────────────────────────────── */

export type ListingCard = {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  price: string;
  stock: ShopCard["stock"];
  /** The seller's own listing (writable); false: their team's, read-only. */
  own: boolean;
  seller: string;
  status: { label: string; tone: ListingTone };
  note: string;
  updated: string;
  /** The Live ↔ Paused switch: its position, or null when there is none. */
  live: boolean | null;
  /** The card's way in: "Finish & submit" for a draft, "Open" otherwise. */
  cta: string;
};

const later = (iso: string | null, now: number) => Boolean(iso && new Date(iso).getTime() > now);

export function listingStatus(l: ApiAthleteListing, now: number): ListingCard["status"] {
  switch (l.state) {
    case "DRAFT":
      return l.reviewNotes ? { label: "Changes asked", tone: "fix" } : { label: "Draft", tone: "none" };
    case "PENDING_APPROVAL":
      return { label: "In review by BTG", tone: "wait" };
    case "PUBLISHED":
      if (later(l.publishAt, now)) return { label: `Goes live ${fmtDay(l.publishAt!)}`, tone: "soon" };
      if (!l.item.active) return { label: "Hidden while the item is paused", tone: "off" };
      return l.visibility === "PRIVATE" ? { label: "Live, private link", tone: "live" } : { label: "Live on the marketplace", tone: "live" };
    case "PAUSED":
      return l.btgAction === "PAUSED" ? { label: "Paused by BTG", tone: "off" } : { label: "Paused", tone: "off" };
    case "ARCHIVED":
      return { label: "Ended", tone: "ended" };
  }
}

export function listingNote(l: ApiAthleteListing, now: number): string {
  if (l.seller.type !== "ATHLETE") return `Listed by ${l.seller.name}. Every sale shows on your Orders page.`;
  switch (l.state) {
    case "DRAFT":
      return l.reviewNotes ? "BTG asked for changes. Make them, then submit it again." : "Only you can see it. Finish it and submit to go live.";
    case "PENDING_APPROVAL": {
      const words = [...new Set(l.hold?.restrictedWords ?? [])];
      return words.length
        ? `Restricted words: ${words.map((w) => `“${w}”`).join(", ")}. Edit them out, or wait for BTG.`
        : "BTG is taking a look. We’ll email you when it’s done.";
    }
    case "PUBLISHED":
      if (later(l.publishAt, now)) return "The checks passed. Sponsors see it from that day.";
      if (!l.item.active) return "Sponsors can’t see it while the item is paused. Switch the item to Available in Inventory.";
      return "Sponsors can buy it now.";
    case "PAUSED":
      return l.btgAction === "PAUSED" ? "Hidden from sponsors. Resuming sends it to BTG, and BTG puts it back live." : "Hidden from sponsors. Switch it back to Live when you’re ready.";
    case "ARCHIVED":
      return "Off the marketplace for good. Orders already placed carry on.";
  }
}

export function listingCard(l: ApiAthleteListing, now: number): ListingCard {
  const own = l.seller.type === "ATHLETE";
  return {
    id: l.id,
    title: l.title,
    kind: l.item.kind,
    kindLabel: kindLabel(l.item.kind),
    price: usd(l.item.priceCents),
    stock: stockOf(l.item.quantity),
    own,
    seller: l.seller.name,
    status: listingStatus(l, now),
    note: listingNote(l, now),
    updated: fmtDay(l.updatedAt),
    live: own && (l.state === "PUBLISHED" || l.state === "PAUSED") ? l.state === "PUBLISHED" : null,
    cta: own && l.state === "DRAFT" ? (l.reviewNotes ? "Make the changes" : "Finish & submit") : "Open",
  };
}

/* ── an item to list, for the "List an item" popup ─────────────────────── */

export type ReadyItem = {
  id: string;
  title: string;
  kind: string;
  kindLabel: string;
  price: string;
  stock: ShopCard["stock"];
  blurb: string | null;
  /** Paused in Inventory: it can't go live until it's switched to Available. */
  paused: boolean;
  /** The textarea's starting words (the item's own description). */
  initial: string;
  /** "What's checked", worked out on the server (listChecks). */
  checks: ListCheck[];
};

export function readyItem(i: ListableItem, checks: ListCheck[]): ReadyItem {
  return {
    id: i.id,
    title: i.title,
    kind: i.kind,
    kindLabel: kindLabel(i.kind),
    price: usd(i.priceCents),
    stock: stockOf(i.quantity),
    blurb: blurbOf(i.description ?? null),
    paused: !i.active,
    initial: i.description?.trim() ?? "",
    checks,
  };
}
