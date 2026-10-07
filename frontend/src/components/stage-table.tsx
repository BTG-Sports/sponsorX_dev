import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { PagerRow, PendingList, ServerList } from "@/components/server-pager";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   The stage table — P1-FE-31 (2026-10-07). One real <table> for every admin
   desk that lists records in columns: sponsor requests, property
   verification, payouts, refunds, delivery issues, guardian handoffs,
   closed accounts, offers and the audit log. Before this each desk drew
   its own CSS grid of <li>s with hidden/duplicated cells per breakpoint;
   a table gives the reader aligned columns, a sticky-feeling header, true
   row hover and a screen reader its headers for free.

   SERVER-PAGED, always (memory: pagination-pattern): <PagedTable> wraps the
   house pager — <PagerRow> above and below (12 / 24 / 60 a page, the range
   text in the top row), the rows dimmed while the next page loads — and
   every count on the page comes from the API's own counts, never from the
   rows in view.

   On a phone (below md) the table stacks: the header hides, each row
   becomes a card and each cell prints its own header first, from
   `data-label` (globals.css `.sx-table`). A cell with no label (a name,
   an action) prints bare.

   Skin: `.sx-table-wrap` is a stage card (glass + corner brackets) with the
   table scrolling inside it; rows rise in one after another on arrival.
   -------------------------------------------------------------------------- */

export type Column = {
  key: string;
  label: ReactNode;
  /** Right-aligned, tabular numerals (money, counts). */
  num?: boolean;
  /** Header for screen readers only (the action column). */
  srOnly?: boolean;
  className?: string;
};

export function StageTable({
  label,
  columns,
  children,
  className = "",
}: {
  /** The table's accessible name ("Refunds to send"). */
  label: string;
  columns: readonly Column[];
  /** <Tr> rows. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`sx-card sx-table-wrap ${className}`}>
      <div className="sx-table-scroll">
        <table className="sx-table" aria-label={label}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`${c.num ? "num" : ""} ${c.className ?? ""}`.trim() || undefined}>
                  {c.srOnly ? <span className="sr-only">{c.label}</span> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

/** A row; `i` staggers its entrance. `tone` tints it (a row that needs you). */
export function Tr({
  i = 0,
  tone,
  className = "",
  children,
}: {
  i?: number;
  tone?: "warn" | "danger" | "accent";
  className?: string;
  children: ReactNode;
}) {
  return (
    <tr data-tone={tone} className={className || undefined} style={{ "--i": i } as CSSProperties}>
      {children}
    </tr>
  );
}

/** A cell. `label` is what a phone prints before it; omit it for a name or an action. */
export function Td({
  label,
  num = false,
  act = false,
  muted = false,
  className = "",
  colSpan,
  children,
}: {
  label?: string;
  num?: boolean;
  /** The action column: right-aligned, never wraps. */
  act?: boolean;
  muted?: boolean;
  className?: string;
  colSpan?: number;
  children?: ReactNode;
}) {
  const cls = [num ? "num" : "", act ? "act" : "", muted ? "text-muted" : "", className].filter(Boolean).join(" ");
  return (
    <td data-label={label} colSpan={colSpan} className={cls || undefined}>
      {children}
    </td>
  );
}

/** A name cell: the strong line and a quiet one under it. */
export function Primary({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <span className="block min-w-0">
      <strong className="block text-[13px] font-semibold text-text">{children}</strong>
      {sub ? <span className="block text-[11px] text-muted">{sub}</span> : null}
    </span>
  );
}

/**
 * A server-paged table: the pager above and below, the rows dimmed while
 * the next page loads. `children` are the page's <Tr> rows; `filtered`
 * makes the range say "matching". A page needs exactly one <ServerList>
 * around its paged controls — pass `bare` when the page already has one.
 */
export function PagedTable({
  page,
  noun,
  filtered = false,
  bare = false,
  label,
  columns,
  children,
  foot,
}: {
  page: PageInfo;
  /** "Refunds" → "Refunds per page". */
  noun: string;
  filtered?: boolean;
  bare?: boolean;
  label: string;
  columns: readonly Column[];
  children: ReactNode;
  /** A note under the table (a rule the desk follows). */
  foot?: ReactNode;
}) {
  const body = (
    <div className="space-y-3">
      <PagerRow page={page} noun={noun} tone="admin" position="top" filtered={filtered} />
      <PendingList>
        <StageTable label={label} columns={columns}>
          {children}
        </StageTable>
      </PendingList>
      {foot}
      <PagerRow page={page} noun={noun} tone="admin" position="bottom" />
    </div>
  );
  return bare ? body : <ServerList>{body}</ServerList>;
}

/** The page's tab strip — links that reset the pager (no ?page on them). */
export function TabStrip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav aria-label={label} className="flex max-w-full flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
      {children}
    </nav>
  );
}

export function TabLink({
  href,
  on,
  count,
  hot = false,
  children,
}: {
  href: string;
  on: boolean;
  count?: number;
  /** Colour the count as something waiting (warn). */
  hot?: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}
    >
      {children}
      {typeof count === "number" && (
        <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${hot && count ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>{count}</span>
      )}
    </Link>
  );
}
