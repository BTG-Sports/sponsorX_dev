"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { Dropdown, FilterChip } from "@/components/filter-kit";
import { ListSearch, PagerRow, PendingList, ServerList, useListNav } from "@/components/server-pager";
import { StageTable, Td, Tr, type Column } from "@/components/stage-table";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   AuditExplorer — the critical-mutation history (P8-FE-02, §23 §30).

   Filters apply the moment they change — entity, person, action and a record
   id — and live in the URL, so a filtered history ("everything that happened
   to this order", "everything this reviewer did") is a link you can send.
   Each row opens to its before → after, field by field, because a mutation
   history that only says "updated" explains nothing.

   P1-FE-31 — SERVER-PAGED, as a stage table: the house pager above and
   below (12 / 24 / 60 a page), every control writing the URL through
   <ServerList>; a filter change resets to page 1. "Load more" on the
   keyset cursor is gone with it.
   -------------------------------------------------------------------------- */

export type AuditRow = {
  id: string;
  at: string;
  action: string;
  entity: string;
  entityId: string;
  actor: { id: string; email: string | null; roles: string[] } | null;
  before: unknown;
  after: unknown;
};

export type AuditPage = {
  rows: AuditRow[];
  nextCursor: string | null;
  page: PageInfo;
  facets: { entities: { entity: string; count: number }[]; actors: { id: string; email: string | null; count: number }[] };
};

type Filters = { entity: string; actorId: string; entityId: string; action: string };

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZone: "UTC" }) + " UTC";

/** Field-level diff of two audit payloads; unchanged keys dropped. */
export function diff(before: unknown, after: unknown): { key: string; from: string; to: string }[] {
  const b = (before && typeof before === "object" ? before : {}) as Record<string, unknown>;
  const a = (after && typeof after === "object" ? after : {}) as Record<string, unknown>;
  const show = (v: unknown) => (v === undefined ? "—" : typeof v === "string" ? v : JSON.stringify(v));
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ key: k, from: show(b[k]), to: show(a[k]) }));
}

const COLUMNS: Column[] = [
  { key: "when", label: "When" },
  { key: "action", label: "Action" },
  { key: "record", label: "Record" },
  { key: "who", label: "Who" },
  { key: "open", label: "Changes", srOnly: true },
];

export function AuditExplorer({ page, filters }: { page: AuditPage; filters: Filters }) {
  return (
    <ServerList>
      <Explorer page={page} filters={filters} />
    </ServerList>
  );
}

function Explorer({ page, filters }: { page: AuditPage; filters: Filters }) {
  const { set, pending } = useListNav();
  const [open, setOpen] = useState<string | null>(null);

  const apply = (patch: Partial<Filters>) => set(Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v || null])));

  const actorLabel = (id: string, email: string | null) => (id === "system" ? "System (worker, webhooks)" : email ?? id);
  const filtered = Boolean(filters.entity || filters.actorId || filters.entityId || filters.action);
  const rows = page.rows;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          label="Filter by record type"
          allLabel="All record types"
          value={filters.entity}
          options={page.facets.entities.map((e) => ({ value: e.entity, label: `${e.entity} · ${e.count}` }))}
          onChange={(v) => apply({ entity: v })}
          tone="admin"
        />
        <Dropdown
          label="Filter by person"
          allLabel="Everyone"
          value={filters.actorId}
          options={page.facets.actors.map((a) => ({ value: a.id, label: `${actorLabel(a.id, a.email)} · ${a.count}` }))}
          onChange={(v) => apply({ actorId: v })}
          tone="admin"
        />
        <div className="min-w-64 flex-1">
          <ListSearch initial={filters.entityId} param="entityId" placeholder="Record id, e.g. an order or deliverable id" label="Filter by record id" tone="admin" />
        </div>
        {pending && <span className="text-[11px] text-faint">Filtering…</span>}
      </div>

      {filtered && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.entity && (
            <FilterChip label="Clear record type" onClear={() => apply({ entity: "" })} tone="admin">{filters.entity}</FilterChip>
          )}
          {filters.actorId && (
            <FilterChip label="Clear person" onClear={() => apply({ actorId: "" })} tone="admin">
              {actorLabel(filters.actorId, page.facets.actors.find((a) => a.id === filters.actorId)?.email ?? null)}
            </FilterChip>
          )}
          {filters.entityId && (
            <FilterChip label="Clear record id" onClear={() => apply({ entityId: "" })} tone="admin">{filters.entityId}</FilterChip>
          )}
          {filters.action && (
            <FilterChip label="Clear action" onClear={() => apply({ action: "" })} tone="admin">{filters.action}*</FilterChip>
          )}
          <button
            type="button"
            onClick={() => apply({ entity: "", actorId: "", entityId: "", action: "" })}
            className="text-[11px] font-medium text-muted hover:text-text"
          >
            Clear all
          </button>
        </div>
      )}

      <PagerRow page={page.page} noun="Changes" tone="admin" position="top" filtered={filtered} />

      <PendingList>
        {rows.length === 0 ? (
          <div className="sx-card rounded-lg border border-line">
            <p className="px-4 py-10 text-center text-xs text-muted">{filtered ? "Nothing matches these filters." : "No audited changes yet."}</p>
          </div>
        ) : (
          <StageTable label="Audited changes, newest first" columns={COLUMNS}>
            {rows.flatMap((r, i) => {
              const d = diff(r.before, r.after);
              const isOpen = open === r.id;
              const main = (
                <Tr key={r.id} i={i} className={isOpen ? "sx-table-open" : undefined}>
                  <Td label="When" muted className="whitespace-nowrap tabular-nums">{fmt(r.at)}</Td>
                  <Td label="Action"><span className="font-mono text-[11px] text-text">{r.action}</span></Td>
                  <Td label="Record">
                    <button
                      type="button"
                      onClick={() => apply({ entity: r.entity, entityId: r.entityId })}
                      className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-text"
                      title="Show this record's whole history"
                    >
                      {r.entity} · {r.entityId.slice(0, 14)}
                    </button>
                  </Td>
                  <Td label="Who" muted className="max-w-64 truncate">
                    {r.actor ? r.actor.email ?? r.actor.id : "System"}
                    {r.actor?.roles?.length ? <span className="ml-1 text-faint">({r.actor.roles.join(", ")})</span> : null}
                  </Td>
                  <Td act>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : r.id)}
                      aria-expanded={isOpen}
                      aria-controls={`audit-${r.id}`}
                      className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-medium text-text hover:bg-surface-2"
                    >
                      {isOpen ? "Hide" : d.length ? `${d.length} field${d.length === 1 ? "" : "s"}` : "Details"}
                    </button>
                  </Td>
                </Tr>
              );
              if (!isOpen) return [main];
              const detail = (
                <tr key={`${r.id}-d`} id={`audit-${r.id}`} className="sx-table-detail">
                  <Td colSpan={COLUMNS.length}>
                    {d.length === 0 ? (
                      <p className="text-[11px] text-muted">No field-level change recorded.</p>
                    ) : (
                      <dl className="space-y-1 text-[11px]">
                        {d.map((c) => (
                          <div key={c.key} className="flex flex-wrap gap-x-2">
                            <dt className="w-32 shrink-0 font-medium text-muted">{c.key}</dt>
                            <dd className="min-w-0 break-all">
                              <span className="text-faint line-through">{c.from}</span>{" "}
                              <span aria-hidden="true">→</span> <span className="text-text">{c.to}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {!filters.actorId && r.actor && (
                      <button type="button" onClick={() => apply({ actorId: r.actor!.id })} className="mt-2 text-[11px] font-medium text-admin hover:underline">
                        Everything this person did →
                      </button>
                    )}
                  </Td>
                </tr>
              );
              return [main, detail];
            })}
          </StageTable>
        )}
      </PendingList>

      <PagerRow page={page.page} noun="Changes" tone="admin" position="bottom" />
      <Badge tone="neutral">read-only — audit rows are never edited</Badge>
    </div>
  );
}
