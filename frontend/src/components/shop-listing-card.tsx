import type { ReactNode } from "react";

import { Badge } from "@/components/ui";
import { athleteLine, kindLabel, ruleNotes, sellerLine, usd, windowLabel, type ApiSearchResult } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S4-FE-01 — one search result as a plain card, for the sellers' "Preview
   as a sponsor sees it" (2S3-FE-01 / -02, with the action disabled). The
   sponsor's own shop draws its items in components/sponsor-shop/ since
   POL-FE-91.

   Presentational and hook-free: a server component in both places. Every
   figure is a field of the GET /marketplace/search row (or, in the preview,
   the same field read from the seller's own listing and item).
   -------------------------------------------------------------------------- */

export function ShopListingCard({ result: r, action }: { result: ApiSearchResult; action?: ReactNode }) {
  const athlete = athleteLine(r.athlete);
  const notes = ruleNotes(r.item.packageRules);
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words">{r.title}</p>
          <p className="mt-0.5 text-[11px] text-muted">{sellerLine(r)}</p>
          {athlete && <p className="mt-0.5 text-[11px] text-muted">Athlete: {athlete}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">{usd(r.item.priceCents)}</p>
          <p className="text-[10px] text-faint">each</p>
        </div>
      </div>
      {r.description && <p className="line-clamp-3 text-xs text-muted">{r.description}</p>}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Badge tone="primary">{kindLabel(r.item.kind)}</Badge>
        <span className="text-muted">{windowLabel(r.item.availableFrom, r.item.availableUntil)}</span>
      </div>
      {notes.length > 0 && <p className="text-[11px] text-faint">{notes.join(" · ")}</p>}
      {action}
    </li>
  );
}
