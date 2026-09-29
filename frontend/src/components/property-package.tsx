import { packageContents, type ApiInventoryItem } from "@/lib/property-p2-live";

/* --------------------------------------------------------------------------
   2S3-FE-01 — what's in a package. A bundle is an inventory item of kind
   PACKAGE with components (GET /inventory/:id); the listing only points at
   it, so this reads the item, never the listing. Server component.
   -------------------------------------------------------------------------- */

export function PropertyPackageContents({ item }: { item: Pick<ApiInventoryItem, "components" | "priceCents" | "packageRules"> }) {
  const p = packageContents(item);
  return (
    <div>
      <p className="text-xs font-semibold">In this package</p>
      {p.rows.length === 0 ? (
        <p className="mt-1 text-[11px] text-muted">No components recorded on this package.</p>
      ) : (
        <>
          <ul className="mt-2 divide-y divide-line-soft text-xs">
            {p.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  {r.title} <span className="text-muted">× {r.quantity}</span>
                  <span className="ml-1.5 text-[11px] text-faint">{r.kind}</span>
                </span>
                <span className="tabular-nums text-muted">{r.line}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex justify-between text-[11px] text-muted">
            <span>Bought separately</span>
            <span className="tabular-nums">{p.separately}</span>
          </p>
          <p className="flex justify-between text-xs font-semibold">
            <span>Package price</span>
            <span className="tabular-nums">{p.price}</span>
          </p>
        </>
      )}
      {p.rules.length > 0 && <p className="mt-2 text-[11px] text-muted">{p.rules.join(" · ")}</p>}
    </div>
  );
}
