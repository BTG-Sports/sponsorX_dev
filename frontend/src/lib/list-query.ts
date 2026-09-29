/* --------------------------------------------------------------------------
   Server-paged lists — the URL side (2026-09-29).

   A paged list's page, page size, search, filters and sort all live in the
   URL (?page=&size=&q=&…), are read by the SERVER page, and are sent to the
   API, which answers one page plus `page: { page, size, total, pages }`.
   Nothing fetches every row to slice it in the browser.

   Conventions (memory: pagination-pattern): page size 12 / 24 / 60, default
   12; `?page` and `?size` are omitted at their defaults; any filter / search
   / sort / size change resets to page 1; an out-of-range page is clamped by
   the API (it answers the last page). Pure — used on the server to build the
   API query and on the client to build the next URL.
   -------------------------------------------------------------------------- */

export const PAGE_SIZES = [12, 24, 60] as const;
export const DEFAULT_SIZE = 12;

export const SIZE_OPTIONS = PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} / page` }));

export type SearchParams = Record<string, string | string[] | undefined>;

export type PageInfo = { page: number; size: number; total: number; pages: number };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** ?page / ?size from the URL, validated to the house sizes. */
export function pageParams(sp: SearchParams): { page: number; size: number } {
  const p = Number(one(sp.page));
  const s = Number(one(sp.size));
  return {
    page: Number.isInteger(p) && p >= 1 ? p : 1,
    size: (PAGE_SIZES as readonly number[]).includes(s) ? s : DEFAULT_SIZE,
  };
}

/** A string URL param, or "" — optionally restricted to an allowed set. */
export function textParam(sp: SearchParams, key: string, allowed?: readonly string[]): string {
  const v = one(sp[key]).trim();
  if (!v) return "";
  if (allowed && !allowed.includes(v)) return "";
  return v.slice(0, 100);
}

/**
 * The API query for a paged list: page + size always, then every non-empty
 * extra (q, state, sort, …). `page` is always sent — it's what turns an
 * endpoint's paged mode on.
 */
export function apiListQuery(sp: SearchParams, extras: Record<string, string>): string {
  const { page, size } = pageParams(sp);
  const u = new URLSearchParams({ page: String(page), size: String(size) });
  for (const [k, v] of Object.entries(extras)) if (v) u.set(k, v);
  return `?${u}`;
}

/** "Showing 13–24 of 132" numbers for a page (0–0 when empty). */
export function rangeOf(p: PageInfo): { start: number; end: number } {
  if (p.total === 0) return { start: 0, end: 0 };
  const start = (p.page - 1) * p.size + 1;
  return { start, end: Math.min(p.total, start + p.size - 1) };
}

/** Which URL keys one list uses — a page with two paged lists gives the
 *  second its own (e.g. { page: "ipage", size: "isize" }). */
export type ListKeys = { page: string; size: string };
export const DEFAULT_KEYS: ListKeys = { page: "page", size: "size" };

/**
 * The next URL's query after a change to ONE list. Its page and size drop
 * out at their defaults; any change other than its page resets that list to
 * page 1 — and only that list: a second list on the page keeps its place.
 */
export function nextQuery(
  current: string,
  patch: Record<string, string | number | null>,
  keys: ListKeys = DEFAULT_KEYS,
): string {
  const u = new URLSearchParams(current);
  const pageOnly = Object.keys(patch).length === 1 && keys.page in patch;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "" || (k === keys.size && Number(v) === DEFAULT_SIZE) || (k === keys.page && Number(v) === 1)) u.delete(k);
    else u.set(k, String(v));
  }
  if (!pageOnly) u.delete(keys.page);
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** pageParams for a list with its own keys. */
export function pageParamsFor(sp: SearchParams, keys: ListKeys): { page: number; size: number } {
  return pageParams({ page: sp[keys.page], size: sp[keys.size] });
}
