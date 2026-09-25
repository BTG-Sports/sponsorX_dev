"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "./ui";
import {
  Dropdown,
  FilterChip,
  SearchInput,
} from "./filter-kit";
import { money, type AdSlotKind, type AdSlotState } from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Ad slot inventory ledger (P1-FE-22). The list behind the page map: every
   sellable position in one table — state and buyer readable per row — with
   filter-kit reused as the acceptance demands (SearchInput, Dropdown,
   FilterChip; admin tone for the desk chrome, violet only on the data marks).

   Filters are instant and URL-synced via replaceState; "Map →" deep-links a
   row to its page's drawer on the flatplan. Repricing and slot creation ship
   disabled naming P9-FE-04.
   -------------------------------------------------------------------------- */

export type InventoryRow = {
  code: string;
  /** 0 = the back cover (rendered as "Back"). */
  page: number;
  pageTitle: string;
  kind: AdSlotKind;
  rackCents: number;
  state: AdSlotState;
  buyer?: string;
  holdFor?: string;
  soldCents?: number;
};

const KIND_LABEL: Record<AdSlotKind, string> = {
  FULL: "Full page",
  HALF: "Half page",
  QUARTER: "Quarter",
  BACK_COVER: "Back cover",
};

const STATE_LABEL: Record<AdSlotState, string> = {
  SOLD: "Sold",
  RESERVED: "Reserved",
  OPEN: "Open",
};

const STATE_TONE = { SOLD: "primary", RESERVED: "warn", OPEN: "neutral" } as const;

/** The state's shape mark — the legend the flatplan taught, carried over. */
function StateDot({ state }: { state: AdSlotState }) {
  if (state === "SOLD")
    return <span className="size-2.5 shrink-0 rounded-[2px] bg-next" aria-hidden="true" />;
  if (state === "RESERVED")
    return (
      <span
        className="size-2.5 shrink-0 rounded-[2px] border-[1.5px] border-dashed border-next/60 bg-next/10"
        aria-hidden="true"
      />
    );
  return (
    /* border-muted/60, not border-line — the line tone vanishes on Frost and
       OPEN is the majority state in the table (QA pass 2) */
    <span
      className="size-2.5 shrink-0 rounded-[2px] border border-muted/60 bg-surface-2"
      aria-hidden="true"
    />
  );
}

type SortKey = "page" | "rack" | "value";

function syncUrl(q: string, state: string, kind: string) {
  const url = new URL(window.location.href);
  const set = (k: string, v: string) =>
    v ? url.searchParams.set(k, v) : url.searchParams.delete(k);
  set("q", q);
  set("state", state);
  set("kind", kind);
  window.history.replaceState(null, "", url.toString());
}

export function EditionInventory({
  rows,
  initial,
}: {
  rows: InventoryRow[];
  initial?: { q?: string; state?: string; kind?: string };
}) {
  const [q, setQ] = useState(initial?.q ?? "");
  /* URL values are untrusted: ?state=BOGUS used to empty the table while the
     dropdown claimed "All states" and the chip rendered blank. Unknown values
     mean no filter (the student-assignments contract). */
  const [state, setState] = useState(
    initial?.state && initial.state in STATE_LABEL ? initial.state : "",
  );
  const [kind, setKind] = useState(
    initial?.kind && initial.kind in KIND_LABEL ? initial.kind : "",
  );
  const [sort, setSort] = useState<SortKey>("page");
  const [dir, setDir] = useState<1 | -1>(1);

  const apply = (nq: string, ns: string, nk: string) => {
    setQ(nq);
    setState(ns);
    setKind(nk);
    syncUrl(nq, ns, nk);
  };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (state && r.state !== state) return false;
      if (kind && r.kind !== kind) return false;
      if (!needle) return true;
      return [r.code, r.buyer, r.holdFor, r.pageTitle]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(needle));
    });
    const key = (r: InventoryRow) =>
      sort === "page"
        ? (r.page === 0 ? 999 : r.page)
        : sort === "rack"
          ? r.rackCents
          : (r.soldCents ?? -1);
    return out.sort((a, b) => (key(a) - key(b)) * dir || a.code.localeCompare(b.code));
  }, [rows, q, state, kind, sort, dir]);

  const ariaSort = (key: SortKey) =>
    sort === key ? (dir === 1 ? ("ascending" as const) : ("descending" as const)) : undefined;

  const header = (label: string, key: SortKey, alignRight = false) => (
    <button
      type="button"
      onClick={() => {
        if (sort === key) setDir((d) => (d === 1 ? -1 : 1));
        else {
          setSort(key);
          setDir(1);
        }
      }}
      className={[
        "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide transition-colors",
        alignRight ? "ml-auto" : "",
        sort === key ? "text-text" : "text-muted hover:text-text",
      ].join(" ")}
    >
      {label}
      <span aria-hidden="true" className="text-[8px]">
        {sort === key ? (dir === 1 ? "▲" : "▼") : ""}
      </span>
    </button>
  );

  const active = Boolean(q || state || kind);

  return (
    <div className="min-w-0">
      {/* ------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={(v) => apply(v, state, kind)}
          placeholder="Search slot, buyer, page…"
          label="Search inventory"
          tone="admin"
        />
        <Dropdown
          label="Filter by state"
          allLabel="All states"
          value={state}
          options={(Object.keys(STATE_LABEL) as AdSlotState[]).map((s) => ({
            value: s,
            label: STATE_LABEL[s],
          }))}
          onChange={(v) => apply(q, v, kind)}
          tone="admin"
        />
        <Dropdown
          label="Filter by position kind"
          allLabel="All kinds"
          value={kind}
          options={(Object.keys(KIND_LABEL) as AdSlotKind[]).map((k) => ({
            value: k,
            label: KIND_LABEL[k],
          }))}
          onChange={(v) => apply(q, state, v)}
          tone="admin"
        />
      </div>

      {/* active filters read as a sentence, each clause dismissible */}
      {active && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {q && (
            <FilterChip label="Clear search" tone="admin" onClear={() => apply("", state, kind)}>
              “{q}”
            </FilterChip>
          )}
          {state && (
            <FilterChip label="Clear state filter" tone="admin" onClear={() => apply(q, "", kind)}>
              {STATE_LABEL[state as AdSlotState]}
            </FilterChip>
          )}
          {kind && (
            <FilterChip label="Clear kind filter" tone="admin" onClear={() => apply(q, state, "")}>
              {KIND_LABEL[kind as AdSlotKind]}
            </FilterChip>
          )}
          <span className="text-[11px] text-faint">
            {shown.length} of {rows.length} slots
          </span>
        </div>
      )}

      {/* -------------------------------------------------------- ledger */}
      {/* Wide table scrolls inside its own container — the page never
         scrolls sideways (the 390px rule). */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[38rem] text-left text-xs">
          <thead>
            <tr className="border-b border-line bg-surface-2/50">
              <th aria-sort={ariaSort("page")} className="px-4 py-2.5">{header("Slot / page", "page")}</th>
              <th className="px-3 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Kind
                </span>
              </th>
              <th className="px-3 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  State
                </span>
              </th>
              <th className="px-3 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Buyer / held for
                </span>
              </th>
              <th aria-sort={ariaSort("rack")} className="px-3 py-2.5 text-right">{header("Rack", "rack", true)}</th>
              <th aria-sort={ariaSort("value")} className="px-3 py-2.5 text-right">{header("Value", "value", true)}</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {shown.map((r) => (
              <tr key={r.code} className="transition-colors hover:bg-surface-2/40">
                <td className="px-4 py-2.5">
                  <span className="font-semibold tabular-nums">{r.code}</span>
                  <span className="mt-0.5 block text-[10px] text-faint">
                    {r.page === 0 ? "Back cover" : `p${r.page} · ${r.pageTitle}`}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-muted">{KIND_LABEL[r.kind]}</td>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-1.5">
                    <StateDot state={r.state} />
                    <Badge tone={STATE_TONE[r.state]}>
                      {STATE_LABEL[r.state].toLowerCase()}
                    </Badge>
                  </span>
                </td>
                <td className="max-w-48 px-3 py-2.5">
                  {r.buyer && <span className="font-medium">{r.buyer}</span>}
                  {r.holdFor && (
                    <span className="block truncate text-muted" title={r.holdFor}>
                      {r.holdFor}
                    </span>
                  )}
                  {!r.buyer && !r.holdFor && <span className="text-faint">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted">
                  {money(r.rackCents)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {r.soldCents != null ? (
                    <span className="font-medium">{money(r.soldCents)}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    href={`/admin/next/editions?open=${r.page}`}
                    className="text-[11px] font-medium text-next transition-colors hover:text-next-soft"
                  >
                    Map →
                  </Link>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  No slots match — clear a filter above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
