import Link from "next/link";
import type { ReactNode } from "react";

import { InventoryPauseToggle } from "@/components/inventory-controls";
import { EmptyState } from "@/components/states";
import { Badge, Card } from "@/components/ui";
import type { InventoryRow } from "@/lib/inventory-live";

/* --------------------------------------------------------------------------
   InventoryManager — 2S2-FE-02. The server-rendered inventory list both the
   athlete (/athlete/inventory) and the team manager (/property/inventory)
   use: heading, what the page is for, a slot for the "New item" panel, and
   one row per item with its price, stock, window and Active/Paused state.

   Rows arrive already shaped (lib/inventory-live toInventoryRow /
   teamItemRow). A row the viewer can't change (a roster athlete's item on
   the team view) shows its owner and no pause control; the API refuses the
   write regardless. There is no delete: the API has no delete route, so an
   item is paused instead.
   -------------------------------------------------------------------------- */

type Result = { ok: true; id: string } | { ok: false; message: string };

export function InventoryManager({
  title,
  intro,
  note,
  create,
  rows,
  hrefBase,
  setActive,
  showOwner = false,
  empty,
  pagerTop,
  pagerBottom,
  children,
}: {
  title: string;
  intro: string;
  /** A plain line under the intro — e.g. who lists these on the marketplace. */
  note?: ReactNode;
  /** The "New item" panel, or an explanation of why there isn't one. */
  create?: ReactNode;
  rows: InventoryRow[];
  /** Each row links to `${hrefBase}/${id}`. */
  hrefBase: string;
  setActive: (id: string, active: boolean) => Promise<Result>;
  showOwner?: boolean;
  empty: { title: string; hint: string };
  pagerTop?: ReactNode;
  pagerBottom?: ReactNode;
  /** Sections after the list (e.g. restrictions). */
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-xs text-muted">{intro}</p>
          {note && <p className="mt-1 text-[11px] text-faint">{note}</p>}
        </div>
      </div>

      {create}

      {rows.length === 0 && !pagerTop ? (
        <EmptyState mark="inbox" title={empty.title} hint={empty.hint} />
      ) : (
        <section>
          {pagerTop}
          {pagerTop && <div className="mt-3" />}
          <Card className="p-0">
            {rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted">{empty.title}</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs">
                    <Link href={`${hrefBase}/${encodeURIComponent(r.id)}`} className="group min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium group-hover:underline">{r.title}</span>
                        {r.isPackage && <Badge tone="primary">Package</Badge>}
                        {showOwner && r.owner && <Badge tone="neutral">{r.owner}</Badge>}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted">
                        {r.kind} · {r.qty}
                        {r.window ? ` · ${r.window}` : ""}
                      </span>
                    </Link>
                    <span className="flex items-center gap-3">
                      <span className="font-semibold tabular-nums">{r.price}</span>
                      <Badge tone={r.active ? "accent" : "neutral"}>{r.status}</Badge>
                      {r.writable ? (
                        <InventoryPauseToggle id={r.id} active={r.active} setActive={setActive} compact />
                      ) : (
                        <span className="text-[10px] text-faint">Read only</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {pagerBottom}
        </section>
      )}

      {children}
    </div>
  );
}
