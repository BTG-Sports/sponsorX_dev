import { isoDay, type ApiCartLine, type ItemWindow } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   POL-FE-92 — the sponsor cart's words and figures, worked out once so the
   page and the client board (components/sponsor-cart/cart-board.tsx) draw
   them the same way, and so they can be tested without a browser.
   Plain data only: everything here crosses into the client island.
   -------------------------------------------------------------------------- */

/** What the shop knows about a line's item, read from GET /marketplace/search/:id.
 *  `gone` — the shop no longer lists it (403/404), so it can't be checked out. */
export type CartLineInfo =
  | { gone: false; kind: string; kindLabel: string; who: string; initials: string; window: ItemWindow; maxQty: number }
  | { gone: true };

/** A cart line as the board draws it; `info` null = the item couldn't be read (never guessed). */
export type CartBoardLine = ApiCartLine & { info: CartLineInfo | null };

/** The three stops, in the sponsor's words. */
export const CART_STEPS = [
  { title: "Review your cart", text: "Change how many or which dates." },
  { title: "Check out", text: "We hold these for you for 15 minutes." },
  { title: "Place the order", text: "Nothing is charged until here." },
] as const;

/** Which stop the sponsor is at: 0 reviewing, 1 checking out (a live hold). */
export function cartStep(held: boolean): number {
  return held ? 1 : 0;
}

const DAY_MS = 86_400_000;
const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** When a line runs: "Nov 1 – Nov 7, 2026" and its length in days (both ends counted). */
export function runOf(startsOn: string, endsOn: string): { label: string; days: number; daysLabel: string } {
  const a = new Date(`${isoDay(startsOn)}T00:00:00.000Z`);
  const b = new Date(`${isoDay(endsOn)}T00:00:00.000Z`);
  const days = Math.max(1, Math.round((b.getTime() - a.getTime()) / DAY_MS) + 1);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const label = days === 1 ? LONG.format(a) : `${sameYear ? SHORT.format(a) : LONG.format(a)} – ${LONG.format(b)}`;
  return { label, days, daysLabel: days === 1 ? "1 day" : `${days} days` };
}

/** How long the cart is kept: it slides to 24 hours after every change.
 *  `share` is the part of those 24 hours still left (0..1). */
export function keptFor(expiresAtIso: string, nowMs: number): { label: string; share: number; expired: boolean } {
  const left = new Date(expiresAtIso).getTime() - nowMs;
  if (!Number.isFinite(left) || left <= 0) return { label: "0 min", share: 0, expired: true };
  const mins = Math.floor(left / 60_000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const label = mins < 1 ? "under a minute" : h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
  return { label, share: Math.min(1, left / DAY_MS), expired: false };
}

/** A quantity the stepper may show: a whole number from 1 to `max`. */
export function clampQty(n: number, max: number): number {
  const top = Math.max(1, Math.floor(max));
  if (!Number.isFinite(n)) return 1;
  return Math.min(top, Math.max(1, Math.floor(n)));
}

/** The most a line can ask for: what the item has, else the API's own ceiling. */
export function maxQtyOf(info: CartLineInfo | null): number {
  return info && !info.gone ? info.maxQty : 1000;
}

/** "3 items" — the quantities added up, the hero's count. */
export function itemCount(lines: Array<{ quantity: number }>): string {
  const n = lines.reduce((s, l) => s + l.quantity, 0);
  return `${n} ${n === 1 ? "item" : "items"}`;
}

/** Lines the shop no longer lists — checkout would refuse them. */
export function goneLines(lines: CartBoardLine[]): CartBoardLine[] {
  return lines.filter((l) => l.info?.gone);
}
