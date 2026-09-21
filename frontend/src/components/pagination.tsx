"use client";

import type { FilterTone } from "@/components/filter-kit";

/* --------------------------------------------------------------------------
   Pagination — a shared, reusable numbered pager (2026-09-15).

   Renders ‹ 1 2 3 4 5 … 10 … 25 › : first and last page always visible, a
   sliding window of pages around the current one, and ellipses for the gaps.
   Tone-aware (sponsor / admin / athlete) so the active page tints in the
   portal color. Presentational + controlled — the parent owns `page` state and
   URL sync; this only renders and calls `onChange`.
   -------------------------------------------------------------------------- */

const ACTIVE_TONE: Record<FilterTone, string> = {
  athlete: "border-athlete/40 bg-athlete/10 text-text",
  admin: "border-admin/40 bg-admin/10 text-text",
  sponsor: "border-sponsor/40 bg-sponsor/10 text-text",
};

/**
 * Page-list model: numbers plus "ellipsis" markers. Pure — exported so the
 * truncation logic can be tested without rendering. Mirrors MUI's usePagination
 * (boundaryCount first/last pages always shown, siblingCount around current).
 */
export function pageItems(
  page: number,
  count: number,
  siblingCount = 1,
  boundaryCount = 1,
): (number | "ellipsis")[] {
  if (count <= 0) return [];
  const range = (start: number, end: number) =>
    Array.from({ length: Math.max(end - start + 1, 0) }, (_, i) => start + i);

  const startPages = range(1, Math.min(boundaryCount, count));
  const endPages = range(
    Math.max(count - boundaryCount + 1, boundaryCount + 1),
    count,
  );

  const siblingsStart = Math.max(
    Math.min(page - siblingCount, count - boundaryCount - siblingCount * 2 - 1),
    boundaryCount + 2,
  );
  const siblingsEnd = Math.min(
    Math.max(page + siblingCount, boundaryCount + siblingCount * 2 + 2),
    endPages.length > 0 ? endPages[0] - 2 : count - 1,
  );

  return [
    ...startPages,
    ...(siblingsStart > boundaryCount + 2
      ? (["ellipsis"] as const)
      : boundaryCount + 1 < count - boundaryCount
        ? [boundaryCount + 1]
        : []),
    ...range(siblingsStart, siblingsEnd),
    ...(siblingsEnd < count - boundaryCount - 1
      ? (["ellipsis"] as const)
      : count - boundaryCount > boundaryCount
        ? [count - boundaryCount]
        : []),
    ...endPages,
  ];
}

function Arrow({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <path d={dir === "prev" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}

const cellCls =
  "grid h-8 min-w-8 place-items-center rounded-lg border px-2 text-xs font-medium tabular-nums transition-colors";

export function Pagination({
  page,
  count,
  onChange,
  tone = "sponsor",
  className = "",
  alwaysShow = false,
}: {
  /** Current page, 1-based. */
  page: number;
  /** Total number of pages. */
  count: number;
  onChange: (page: number) => void;
  tone?: FilterTone;
  className?: string;
  /** Render even for a single page (as ‹ 1 › with disabled arrows). Default
      hides the pager when there's nothing to page through. */
  alwaysShow?: boolean;
}) {
  if (count <= 1 && !alwaysShow) return null;
  const items = pageItems(Math.min(Math.max(page, 1), Math.max(count, 1)), Math.max(count, 1));

  const arrowBtn = (dir: "prev" | "next", target: number, disabled: boolean) => (
    <button
      type="button"
      aria-label={dir === "prev" ? "Previous page" : "Next page"}
      disabled={disabled}
      onClick={() => onChange(target)}
      className={[
        cellCls,
        disabled
          ? "border-line text-faint opacity-50"
          : "border-line text-muted hover:text-text",
      ].join(" ")}
    >
      <Arrow dir={dir} />
    </button>
  );

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      {arrowBtn("prev", page - 1, page <= 1)}

      {items.map((it, i) =>
        it === "ellipsis" ? (
          <span
            key={`e${i}`}
            aria-hidden="true"
            className="grid h-8 min-w-8 place-items-center text-xs text-faint"
          >
            …
          </span>
        ) : (
          <button
            key={it}
            type="button"
            aria-label={`Page ${it}`}
            aria-current={it === page ? "page" : undefined}
            onClick={() => onChange(it)}
            className={[
              cellCls,
              it === page
                ? `${ACTIVE_TONE[tone]} font-semibold`
                : "border-line text-muted hover:text-text",
            ].join(" ")}
          >
            {it}
          </button>
        ),
      )}

      {arrowBtn("next", page + 1, page >= count)}
    </nav>
  );
}
