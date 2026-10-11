import Link from "next/link";

import { ArenaHead, ArenaPanel } from "@/components/arena-stage";
import { InventoryItemView } from "@/components/inventory-item";
import type { ApiInventoryItem } from "@/lib/inventory-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { setItemActiveAction, updateItemAction } from "../actions";

/* --------------------------------------------------------------------------
   Edit an item — 2S2-FE-02. Athlete portal.

   Reads GET /inventory/:id (own scope; 403 is the API's answer for "not
   yours" and "no such item" alike). Writes PATCH /inventory/:id through
   ../actions — only the changed fields, and {active} for pause/resume. A
   price or quantity change while a listing of the item is PUBLISHED comes
   back 409 and the form shows the API's "pause the listing first".
   A package's contents are fixed at creation (shown, not editable). No
   delete: there is no route for it.

   P1-ART-22 (2026-10-11) — on the Arena: the title row is an ArenaHead
   (InventoryItemView `arena`), the form sits on a plate, and the not-found
   answer is a plate under the same head. Visual only — same read, same
   writes.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteInventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePortalAccess("athlete");
  const { id } = await params;
  const res = await apiFetch(`/inventory/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-6">
        <ArenaHead
          title="Item"
          actions={
            <Link href="/athlete/inventory" className="rounded-md text-xs font-medium text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-athlete/50">
              ← All items
            </Link>
          }
        />
        <ArenaPanel tone="ink" delay={0.12}>
          <p className="text-sm font-medium">Item not found</p>
          <p className="mt-1 text-xs text-muted">This item doesn&rsquo;t exist or isn&rsquo;t yours to view.</p>
        </ArenaPanel>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Inventory item unavailable (${res.status}).`);
  const item = (await res.json()) as ApiInventoryItem;

  return (
    <InventoryItemView
      item={item}
      backHref="/athlete/inventory"
      writable
      update={updateItemAction}
      setActive={setItemActiveAction}
      arena
    />
  );
}
