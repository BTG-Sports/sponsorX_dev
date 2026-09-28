"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Badge, Card } from "@/components/ui";
import { Dropdown, FilterChip, SearchInput } from "@/components/filter-kit";

/* --------------------------------------------------------------------------
   AuditExplorer — the critical-mutation history (P8-FE-02, §23 §30).

   Filters apply the moment they change — entity, person, action and a record
   id — and live in the URL, so a filtered history ("everything that happened
   to this order", "everything this reviewer did") is a link you can send.
   Changing a filter re-reads the first page from the server; "Load more"
   walks the keyset cursor. Each row opens to its before → after, field by
   field, because a mutation history that only says "updated" explains
   nothing.
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

export function AuditExplorer({
  page,
  filters,
  loadMore,
}: {
  page: AuditPage;
  filters: Filters;
  loadMore: (filters: Filters, cursor: string) => Promise<{ ok: true; page: AuditPage } | { ok: false; message: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, start] = useTransition();
  const [extra, setExtra] = useState<{ key: string; rows: AuditRow[]; cursor: string | null } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState(filters.entityId);

  /* Extra pages belong to the filter set they were loaded under. */
  const key = JSON.stringify(filters);
  const more = extra?.key === key ? extra : null;
  const rows = [...page.rows, ...(more?.rows ?? [])];
  const cursor = more ? more.cursor : page.nextCursor;

  const apply = (patch: Partial<Filters>) => {
    const next = { ...filters, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
    start(() => router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`, { scroll: false }));
  };

  const loadNext = async () => {
    if (!cursor) return;
    setErr(null);
    const r = await loadMore(filters, cursor);
    if (!r.ok) return setErr(r.message);
    setExtra({ key, rows: [...(more?.rows ?? []), ...r.page.rows], cursor: r.page.nextCursor });
  };

  const actorLabel = (id: string, email: string | null) => (id === "system" ? "System (worker, webhooks)" : email ?? id);
  const filtered = Boolean(filters.entity || filters.actorId || filters.entityId || filters.action);

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
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            apply({ entityId: v.trim() });
          }}
          placeholder="Record id, e.g. an order or deliverable id"
          label="Filter by record id"
          tone="admin"
        />
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
            <FilterChip label="Clear record id" onClear={() => { setQ(""); apply({ entityId: "" }); }} tone="admin">{filters.entityId}</FilterChip>
          )}
          {filters.action && (
            <FilterChip label="Clear action" onClear={() => apply({ action: "" })} tone="admin">{filters.action}*</FilterChip>
          )}
          <button
            type="button"
            onClick={() => { setQ(""); apply({ entity: "", actorId: "", entityId: "", action: "" }); }}
            className="text-[11px] font-medium text-muted hover:text-text"
          >
            Clear all
          </button>
        </div>
      )}

      <Card className="p-0">
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs text-muted">{filtered ? "Nothing matches these filters." : "No audited changes yet."}</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((r) => {
              const d = diff(r.before, r.after);
              const isOpen = open === r.id;
              return (
                <li key={r.id}>
                  {/* Sibling buttons, not nested — a button inside a button
                      is invalid HTML and breaks hydration. */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-xs transition-colors hover:bg-surface-2/40">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : r.id)}
                      aria-expanded={isOpen}
                      className="flex min-w-0 flex-wrap items-center gap-x-3 text-left"
                    >
                      <span className="w-40 shrink-0 tabular-nums text-faint">{fmt(r.at)}</span>
                      <span className="font-mono text-[11px] text-text">{r.action}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQ(r.entityId);
                        apply({ entity: r.entity, entityId: r.entityId });
                      }}
                      className="rounded border border-line px-1.5 py-0.5 text-[10px] text-muted hover:text-text"
                      title="Show this record's whole history"
                    >
                      {r.entity} · {r.entityId.slice(0, 14)}
                    </button>
                    <span className="ml-auto truncate text-[11px] text-muted">
                      {r.actor ? r.actor.email ?? r.actor.id : "System"}
                      {r.actor?.roles?.length ? <span className="ml-1 text-faint">({r.actor.roles.join(", ")})</span> : null}
                    </span>
                  </div>
                  {isOpen && (
                    <div className="border-t border-line-soft bg-surface-2/30 px-4 py-3">
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {err && <p role="alert" className="text-[11px] text-danger">{err}</p>}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted">
          {rows.length} change{rows.length === 1 ? "" : "s"} shown{cursor ? " · more below" : ""}
        </p>
        {cursor && (
          <button type="button" onClick={loadNext} className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-text hover:bg-surface-2">
            Load more
          </button>
        )}
      </div>
      <Badge tone="neutral">read-only — audit rows are never edited</Badge>
    </div>
  );
}
