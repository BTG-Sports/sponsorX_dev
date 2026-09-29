/**
 * Offset paging for the portals' lists — the one shape every paged list
 * endpoint answers with (2026-09-29, "no list fetches everything and slices
 * it in the browser").
 *
 * A list endpoint is PAGED when the caller sends `?page=` (1-based). It then
 * answers `{ <items>, page: { page, size, total, pages } }`, counting the
 * total with the same WHERE it pages, so "Showing 13–24 of 132" and the last
 * page number are the database's answer, not the browser's. Without `?page=`
 * the endpoint keeps its old unpaged behaviour, so existing callers (the
 * worker, aggregates, other consumers of §8's API) are unchanged.
 *
 * Sizes follow the house pagination convention (12 / 24 / 60, default 12);
 * any other positive size is clamped to MAX_PAGE_SIZE rather than refused, so
 * a hand-typed URL degrades instead of erroring. An out-of-range page is not
 * an error either: it is answered as the last page (the UI's `safePage`
 * clamp, done where the count is known).
 */

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 100;

export type PageRequest = { page: number; size: number; skip: number; take: number };

export type PageInfo = { page: number; size: number; total: number; pages: number };

/** `?page=` present → a page request; absent → null (unpaged, legacy). */
export function pageRequest(query: Record<string, unknown>, defaultSize = DEFAULT_PAGE_SIZE): PageRequest | null {
  if (query.page === undefined) return null;
  const pageN = Number(query.page);
  const sizeN = query.size === undefined ? defaultSize : Number(query.size);
  const page = Number.isInteger(pageN) && pageN >= 1 ? pageN : 1;
  const size = Number.isInteger(sizeN) && sizeN >= 1 ? Math.min(sizeN, MAX_PAGE_SIZE) : defaultSize;
  return { page, size, skip: (page - 1) * size, take: size };
}

/** Clamp a request to what exists, once the total is known. */
export function clampPage(req: PageRequest, total: number): PageRequest {
  const pages = Math.max(1, Math.ceil(total / req.size));
  if (req.page <= pages) return req;
  return { ...req, page: pages, skip: (pages - 1) * req.size };
}

export function pageInfo(req: PageRequest, total: number): PageInfo {
  return { page: req.page, size: req.size, total, pages: Math.max(1, Math.ceil(total / req.size)) };
}

/**
 * Count, clamp, then read — the paged-read recipe in one place. `count` and
 * `read` must use the same WHERE; `read` gets the (possibly clamped) skip/take.
 */
export async function readPage<T>(
  req: PageRequest,
  count: () => Promise<number>,
  read: (skip: number, take: number) => Promise<T[]>,
): Promise<{ rows: T[]; page: PageInfo }> {
  const total = await count();
  const at = clampPage(req, total);
  const rows = total === 0 ? [] : await read(at.skip, at.take);
  return { rows, page: pageInfo(at, total) };
}

/** `?q=` as a trimmed, bounded search string, or undefined. */
export function searchTerm(query: Record<string, unknown>): string | undefined {
  const q = typeof query.q === "string" ? query.q.trim().replace(/\0/g, "") : "";
  return q ? q.slice(0, 100) : undefined;
}

/** A comma list query value filtered to an allowed set (`?state=A,B`). */
export function allowedList<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (typeof value !== "string" || !value) return [];
  return value.split(",").filter((v): v is T => (allowed as readonly string[]).includes(v));
}
