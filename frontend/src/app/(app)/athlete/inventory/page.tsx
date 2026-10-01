import { InventoryNewItem } from "@/components/inventory-controls";
import { InventoryManager } from "@/components/inventory-manager";
import { InventoryRestrictions } from "@/components/inventory-restrictions";
import { EmptyState } from "@/components/states";
import { Card, SectionHeading } from "@/components/ui";
import {
  componentOptions,
  toInventoryRow,
  toRestrictionRow,
  type ApiInventoryItem,
  type ApiRestriction,
} from "@/lib/inventory-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";
import {
  addRestrictionAction,
  createItemAction,
  removeRestrictionAction,
  setItemActiveAction,
} from "./actions";

/* --------------------------------------------------------------------------
   My inventory — 2S2-FE-02. Athlete portal.

   What the athlete sells, at their price: each item's kind, price, stock,
   availability window and brand categories, with pause/resume and a form
   for a new item (a single item or a PACKAGE of their own items).

   Live only. Reads GET /inventory (inventoryItem read "own") and GET
   /restrictions (brandRestriction read "own"). Writes through ./actions:
   POST /inventory, PATCH /inventory/:id, POST/DELETE /restrictions. A 403
   (a guardian's login — inventory is the athlete's) is explained, not
   faked; any other failure is the error page.

   Honest gaps:
     · Creating needs the athlete to be APPROVED or ACTIVE — the API answers
       409 and the form says "Inventory opens once BTG approves your
       profile". The page can't tell beforehand (GET /inventory carries no
       athlete state), so the form is always offered.
     · No "sold" count: the API returns raw stock only.
     · No delete (no route) — pause instead.
     · An athlete with no team lists these themselves on /athlete/listings
       (2S3-BE-05); a roster athlete's team lists them.
     · packageRules (min/max per order, bundle-only, exclusive, needs
       approval) aren't editable here yet — the API keeps what it has.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

export default async function AthleteInventoryPage() {
  await requirePortalAccess("athlete");

  const [invRes, resRes] = await Promise.all([apiFetch("/inventory"), apiFetch("/restrictions")]);
  if (invRes.status === 403) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">My inventory</h1>
        <EmptyState
          mark="users"
          title="Inventory is the athlete's to manage"
          hint="Items are priced and edited from the athlete's own login. A guardian's login can't change them."
        />
      </div>
    );
  }
  if (!invRes.ok) throw new Error(`Inventory unavailable (${invRes.status}).`);
  if (!resRes.ok && resRes.status !== 403) throw new Error(`Restrictions unavailable (${resRes.status}).`);

  const { items } = (await invRes.json()) as { items: ApiInventoryItem[] };
  const restrictions = resRes.ok ? ((await resRes.json()) as { restrictions: ApiRestriction[] }).restrictions : null;
  const rows = items.map((i) => toInventoryRow(i));

  return (
    <InventoryManager
      title="My inventory"
      intro="What you sell, at your price. Sponsors buy these; BTG takes its fee on each order."
      note="With no team, you list these yourself under List my item; on a team, your team lists them."
      create={
        <InventoryNewItem
          create={createItemAction}
          components={componentOptions(items)}
          savedHref="/athlete/inventory/{id}"
          startOpen={items.length === 0}
        />
      }
      rows={rows}
      hrefBase="/athlete/inventory"
      setActive={setItemActiveAction}
      empty={{
        title: "Nothing listed yet",
        hint: "Add what you'd sell to a local business: a clinic session, a sponsored post, an appearance. You set the price and who you won't work with.",
      }}
    >
      {restrictions && (
        <section>
          <SectionHeading
            title="Categories you won't promote"
            hint="Applies to every item and every offer, for the dates shown."
          />
          <Card>
            <InventoryRestrictions
              rows={restrictions.map(toRestrictionRow)}
              add={addRestrictionAction}
              remove={removeRestrictionAction}
            />
          </Card>
        </section>
      )}
    </InventoryManager>
  );
}
