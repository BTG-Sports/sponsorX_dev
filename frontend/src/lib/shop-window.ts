/* --------------------------------------------------------------------------
   POL-FE-91 — the sponsor shop as a shop window: the pure half.

   The owner (2026-11-16): "do the whole thing we did in athlete inventory
   and listing — the items can be viewed before clicking add to cart, and a
   button on the item itself for add to cart — easy to understand." So every
   word and figure an item shows is worked out here, server-side, from one
   GET /marketplace/search row (memory: stats-must-be-retrievable), and the
   client island (components/sponsor-shop/shop-window.tsx) only draws it.

   Plain words throughout: "Available Oct 1 – Oct 31", "4 available",
   "Buy 2–5 at a time", "Exclusive: one sponsor per date range".
   -------------------------------------------------------------------------- */

import { BRAND_CATEGORIES, categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import { US_STATES } from "@/lib/onboarding-live";
import {
  INVENTORY_KINDS,
  MIN_PRICE_BANDS,
  PRICE_BANDS,
  dayToIso,
  defaultQuantity,
  isoDay,
  kindLabel,
  propertyLine,
  usd,
  type ApiSearchResult,
  type ItemWindow,
  type ShopFilters,
} from "@/lib/shop-live";

export type WhenTone = "open" | "soon" | "ending" | "later";

/** One item on the shop window, ready to draw. Plain data: it crosses into the client island. */
export type ShopItem = {
  id: string;
  title: string;
  description: string | null;
  kind: string;
  kindLabel: string;
  /** One line on what the sponsor gets ("Your brand, on camera."). */
  pitch: string;
  priceCents: number;
  price: string;
  /** "each", or "for the package". */
  per: string;
  /** The person the item is about: the athlete, else the seller. */
  who: string;
  /** "Basketball · Guard", or null. */
  whoSub: string | null;
  initials: string;
  /** Who sells it and how ("Westfield Hawks · school · Laurel, MD" / "Independent athlete"). */
  seller: { name: string; line: string; team: boolean };
  /** When it can run, as the card says it. */
  when: { label: string; tone: WhenTone; flag: string | null };
  /** "4 available", "Sold out", or null when there's no limit. */
  stock: string | null;
  /** None left: the card says so and nothing can be added. */
  soldOut: boolean;
  /** The brand categories it suits, labelled. */
  fits: string[];
  /** What to know before buying, as short sentences. */
  rules: string[];
  /** For the add-to-cart popup: the item's window and package rules. */
  window: ItemWindow;
  /** The quantity the popup opens on, and the most it allows. */
  minQty: number;
  maxQty: number;
};

const PITCH: Record<string, string> = {
  SOCIAL_POST: "Your brand, in front of their followers.",
  VIDEO: "Your brand, on camera.",
  APPEARANCE: "In person, at your store or event.",
  AUTOGRAPH: "Signed, for your customers.",
  CAMP: "A session with your name on it.",
  SIGNAGE: "Your logo, where people look.",
  TICKETS: "Seats for your people.",
  PACKAGE: "Several things, one price.",
  OTHER: "Something only this seller offers.",
};

/** The type rail: one chip per kind, with a word on what it is. */
export const KIND_RAIL: Array<{ value: string; label: string }> = INVENTORY_KINDS.map((k) => ({ value: k, label: kindLabel(k) }));

const DAY = 86_400_000;
const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const short = (iso: string) => SHORT.format(new Date(iso));
const long = (iso: string) => LONG.format(new Date(iso));

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return ((parts[0][0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

/**
 * When the item can run, said the way a person would — and a flag when the
 * timing matters ("Ends in 5 days", "Starts Dec 1"). Days are calendar days
 * (midnight UTC on the wire), compared against `today` ("YYYY-MM-DD").
 */
export function whenOf(from: string | null, until: string | null, today: string): ShopItem["when"] {
  const t = Date.parse(`${today}T00:00:00.000Z`);
  if (!from && !until) return { label: "Any dates", tone: "open", flag: null };
  const fromDay = from ? Date.parse(`${isoDay(from)}T00:00:00.000Z`) : null;
  const untilDay = until ? Date.parse(`${isoDay(until)}T00:00:00.000Z`) : null;
  const sameYear = from && until && isoDay(from).slice(0, 4) === isoDay(until).slice(0, 4);
  const label =
    from && until
      ? `${sameYear ? short(from) : long(from)} – ${long(until)}`
      : from
        ? `From ${long(from)}`
        : `Until ${long(until as string)}`;
  if (fromDay !== null && fromDay > t) return { label, tone: "later", flag: `Starts ${short(from as string)}` };
  if (untilDay !== null) {
    const left = Math.round((untilDay - t) / DAY);
    if (left >= 0 && left <= 14) return { label, tone: "ending", flag: left === 0 ? "Last day today" : `Ends in ${left} day${left === 1 ? "" : "s"}` };
  }
  return { label, tone: "soon", flag: null };
}

/** What a buyer needs to know before adding, as short plain sentences. */
export function rulesOf(rules: ApiSearchResult["item"]["packageRules"]): string[] {
  if (!rules) return [];
  const out: string[] = [];
  const { minQuantity: min, maxQuantity: max } = rules;
  if (min != null && max != null) out.push(min === max ? `Bought ${min} at a time` : `Buy ${min}–${max} at a time`);
  else if (min != null && min > 1) out.push(`Buy at least ${min} at a time`);
  else if (max != null) out.push(`Buy up to ${max} at a time`);
  if (rules.exclusive) out.push("Exclusive: one sponsor per date range");
  if (rules.requiresApproval) out.push("The seller says yes to your order first (within 48 hours)");
  return out;
}

/** A search row → the item the shop window draws. */
export function shopItem(r: ApiSearchResult, today: string): ShopItem {
  const team = Boolean(r.property);
  const sellerName = r.property?.name ?? r.seller?.name ?? r.athlete?.displayName ?? "Athlete";
  const who = r.athlete?.displayName ?? sellerName;
  const whoSub = r.athlete ? [r.athlete.sport, r.athlete.position].filter(Boolean).join(" · ") || null : null;
  const rules = r.item.packageRules;
  const stockMax = r.item.quantity ?? null;
  const maxQty = Math.max(1, Math.min(1000, rules?.maxQuantity ?? 1000, stockMax ?? 1000));
  return {
    id: r.id,
    title: r.title,
    description: r.description?.trim() || null,
    kind: r.item.kind,
    kindLabel: kindLabel(r.item.kind),
    pitch: PITCH[r.item.kind] ?? PITCH.OTHER,
    priceCents: r.item.priceCents,
    price: usd(r.item.priceCents),
    per: r.item.kind === "PACKAGE" ? "for the package" : "each",
    who,
    whoSub,
    initials: initialsOf(who),
    seller: {
      name: sellerName,
      line: r.property ? propertyLine(r.property) : "Independent athlete — sells for themselves",
      team,
    },
    when: whenOf(r.item.availableFrom, r.item.availableUntil, today),
    stock: stockMax === null ? null : stockMax <= 0 ? "Sold out" : `${stockMax.toLocaleString("en-US")} available`,
    soldOut: stockMax !== null && stockMax <= 0,
    fits: (r.item.categories ?? []).map((c) => categoryLabel(c as BrandCategory)),
    rules: rulesOf(rules),
    window: { availableFrom: r.item.availableFrom, availableUntil: r.item.availableUntil, packageRules: rules },
    minQty: Math.min(defaultQuantity(rules), maxQty),
    maxQty,
  };
}

/* ── the filters: what's narrowing the shop, as chips a person can remove ── */

export type FilterChipDef = { key: string; label: string; clear: Record<string, null> };

const bandLabel = (bands: { value: string; label: string }[], v: string) => bands.find((b) => b.value === v)?.label ?? null;

/**
 * The "More filters" choices in force, one chip each (type and the search have
 * their own controls in sight, so they're not repeated). Only values the
 * page actually applied (`shownFilters`) — a stale URL value shows no chip.
 */
export function filterChips(f: ShopFilters): FilterChipDef[] {
  const out: FilterChipDef[] = [];
  if ((BRAND_CATEGORIES as readonly string[]).includes(f.category)) out.push({ key: "category", label: `For ${categoryLabel(f.category as BrandCategory).toLowerCase()} brands`, clear: { category: null } });
  if (f.sport) out.push({ key: "sport", label: `Sport: ${f.sport}`, clear: { sport: null } });
  if (f.stateCode) {
    const s = US_STATES.find((x) => x.code === f.stateCode.toUpperCase());
    out.push({ key: "stateCode", label: `In ${s?.name ?? f.stateCode}`, clear: { stateCode: null } });
  }
  const from = f.minPrice ? bandLabel(MIN_PRICE_BANDS, f.minPrice) : null;
  const upTo = f.maxPrice ? bandLabel(PRICE_BANDS, f.maxPrice) : null;
  if (from) out.push({ key: "minPrice", label: `Price ${from}`, clear: { minPrice: null } });
  if (upTo) out.push({ key: "maxPrice", label: `Price ${upTo.toLowerCase()}`, clear: { maxPrice: null } });
  const fromDay = dayToIso(f.availableFrom) ? f.availableFrom : "";
  const untilDay = dayToIso(f.availableUntil) ? f.availableUntil : "";
  if (fromDay || untilDay) {
    const a = fromDay || untilDay;
    const b = untilDay || fromDay;
    const label = a === b ? `Free on ${long(`${a}T00:00:00.000Z`)}` : `Free ${short(`${a}T00:00:00.000Z`)} – ${long(`${b}T00:00:00.000Z`)}`;
    out.push({ key: "dates", label, clear: { availableFrom: null, availableUntil: null } });
  }
  return out;
}

/** Every "More filters" key, for "Clear all". */
export const MORE_FILTER_KEYS = ["category", "sport", "stateCode", "minPrice", "maxPrice", "availableFrom", "availableUntil"] as const;
