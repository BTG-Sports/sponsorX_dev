import { Badge, Card } from "@/components/ui";
import type { ThisEditionView } from "@/lib/this-edition";

/* POL-FE-77 — read-only: the school's current edition, for its students and advisor. */
export function ThisEditionCard({ v }: { v: ThisEditionView }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">This edition · {v.label}</h2>
        <Badge tone="neutral">{v.state}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        {v.closeLine} · {v.sold} of {v.total} {v.total === 1 ? "position" : "positions"} sold
      </p>
      {v.open.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-medium text-muted">Still open</p>
          <ul className="mt-1 space-y-0.5 text-xs text-text">
            {v.open.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </>
      )}
    </Card>
  );
}
