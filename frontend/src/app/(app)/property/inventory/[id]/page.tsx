import Link from "next/link";

import { InventoryItemView } from "@/components/inventory-item";
import { Card } from "@/components/ui";
import type { ApiInventoryItem } from "@/lib/inventory-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import { setItemActiveAction, updateItemAction } from "@/app/(app)/athlete/inventory/actions";

/* --------------------------------------------------------------------------
   One team item — 2S2-FE-02. Property portal, PROPERTY_MGR.

   Reads GET /inventory/:id (own-property read: the team's items and its
   roster athletes'; 403 = not in reach or no such item). The team's own
   item (propertyId is the manager's property) gets the edit form and
   pause/resume through PATCH /inventory/:id; a roster athlete's item is
   read-only — inventoryItem write is "own", and the API refuses it anyway.

   Gap: GET /inventory/:id carries the owner's id, not their name, so a
   roster item says "a roster athlete's item" rather than whose.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function PropertyInventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePortalAccess("property");
  const { id } = await params;
  const res = await apiFetch(`/inventory/${encodeURIComponent(id)}`);
  if (res.status === 403 || res.status === 404) {
    return (
      <div className="space-y-4">
        <Link href="/property/inventory" className="text-xs text-muted hover:text-text">
          ← All items
        </Link>
        <Card>
          <p className="text-sm font-medium">Item not found</p>
          <p className="mt-1 text-xs text-muted">This item doesn&rsquo;t exist or isn&rsquo;t on your team.</p>
        </Card>
      </div>
    );
  }
  if (!res.ok) throw new Error(`Inventory item unavailable (${res.status}).`);
  const item = (await res.json()) as ApiInventoryItem;
  const teamOwned = item.propertyId !== null && (!actor.propertyId || item.propertyId === actor.propertyId);

  return (
    <InventoryItemView
      item={item}
      backHref="/property/inventory"
      writable={teamOwned}
      ownerNote="A roster athlete's item — only they can change it, from their own login."
      update={updateItemAction}
      setActive={setItemActiveAction}
    />
  );
}
