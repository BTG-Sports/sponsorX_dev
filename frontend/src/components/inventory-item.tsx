import Link from "next/link";

import { InventoryPauseToggle } from "@/components/inventory-controls";
import { InventoryForm } from "@/components/inventory-form";
import { Badge, Card, SectionHeading } from "@/components/ui";
import {
  categoryLabel,
  fmtDay,
  kindLabel,
  qtyLabel,
  usd,
  windowLabel,
  type ApiInventoryItem,
  type BrandCategory,
  type InventoryBody,
} from "@/lib/inventory-live";

/* --------------------------------------------------------------------------
   InventoryItemView — 2S2-FE-02. One item: the edit form and pause/resume
   when the viewer owns it, a read-only summary when they don't (a roster
   athlete's item on the team view). Every figure is a field of GET
   /inventory/:id. Shared by /athlete/inventory/[id] and
   /property/inventory/[id].
   -------------------------------------------------------------------------- */

type Result = { ok: true; id: string } | { ok: false; message: string };

const cats = (list: string[]) => (list.length ? list.map((c) => categoryLabel(c as BrandCategory)).join(", ") : "None");

export function InventoryItemView({
  item,
  backHref,
  writable,
  ownerNote,
  update,
  setActive,
}: {
  item: ApiInventoryItem;
  backHref: string;
  writable: boolean;
  /** Why it's read-only, shown instead of the form. */
  ownerNote?: string;
  update: (id: string, patch: Partial<InventoryBody>) => Promise<Result>;
  setActive: (id: string, active: boolean) => Promise<Result>;
}) {
  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-xs text-muted hover:text-text">
        ← All items
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{item.title}</h1>
            <Badge tone={item.active ? "accent" : "neutral"}>{item.active ? "Active" : "Paused"}</Badge>
            {item.kind === "PACKAGE" && <Badge tone="primary">Package</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted">
            {kindLabel(item.kind)} · {usd(item.priceCents)} · {qtyLabel(item.quantity)} · version {item.version}
          </p>
        </div>
        {writable && <InventoryPauseToggle id={item.id} active={item.active} setActive={setActive} />}
      </div>

      {writable ? (
        <Card>
          <SectionHeading title={`Edit: ${item.title}`} hint={`Last changed ${fmtDay(item.updatedAt)}`} />
          <InventoryForm mode="edit" item={item} update={update} />
        </Card>
      ) : (
        <Card>
          <SectionHeading title="Item details" hint={ownerNote} />
          <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
            {[
              ["Kind", kindLabel(item.kind)],
              ["Price", usd(item.priceCents)],
              ["Quantity", qtyLabel(item.quantity)],
              ["Available", windowLabel(item.availableFrom, item.availableUntil) ?? "No dates set"],
              ["Won't sell to", cats(item.restrictedCategories)],
              ["Good fit for", cats(item.categories)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-faint">{k}</dt>
                <dd className="mt-0.5 font-medium text-text">{v}</dd>
              </div>
            ))}
          </dl>
          {item.description && <p className="mt-4 border-t border-line-soft pt-3 text-xs leading-relaxed text-muted">{item.description}</p>}
          {item.components.length > 0 && (
            <div className="mt-4 border-t border-line-soft pt-3">
              <p className="text-[11px] font-medium text-muted">Bundles</p>
              <ul className="mt-1.5 space-y-1 text-xs">
                {item.components.map((c) => (
                  <li key={c.component.id} className="flex justify-between gap-2">
                    <span className="truncate">{c.component.title}</span>
                    <span className="text-muted tabular-nums">× {c.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
