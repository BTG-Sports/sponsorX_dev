import type { ReactNode } from "react";

import { at, StadiumChip, StadiumDate } from "@/components/stadium-stage";
import { athleteLine, kindLabel, ruleNotes, sellerLine, usd, type ApiSearchResult } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   Shop — on the Stadium Board (P1-ART-23 Task 13, spec 2026-10-11 §7.8).
   One search result, as an LED panel card. Sponsor-only (unlike the shared
   `ShopListingCard`, which the seller "preview as a sponsor sees it" routes
   also render — this one is never reused there, so it is free to carry the
   Stadium's own look and viewer-local dates).

   Presentational and hook-free: a server component. Every figure is a field
   of the GET /marketplace/search row (memory: stats-must-be-retrievable).
   Dates are real timestamps (midnight UTC on the wire), shown in the
   viewer's own timezone via `StadiumDate` rather than the shared card's
   fixed-UTC `windowLabel`.
   -------------------------------------------------------------------------- */

export function ShopStadiumCard({ result: r, action, i = 0 }: { result: ApiSearchResult; action?: ReactNode; i?: number }) {
  const athlete = athleteLine(r.athlete);
  const notes = ruleNotes(r.item.packageRules);
  const { availableFrom, availableUntil } = r.item;
  const dates =
    !availableFrom && !availableUntil ? (
      "Any dates"
    ) : (
      <>
        {availableFrom ? <StadiumDate iso={availableFrom} format="date" /> : "any start"}
        {" – "}
        {availableUntil ? <StadiumDate iso={availableUntil} format="date" /> : "no end date"}
      </>
    );

  return (
    <li data-spot="" className="sx-stadium-panel sx-stadium-in flex flex-col gap-3 p-4" style={at(0.15 + i * 0.05)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words text-text">{r.title}</p>
          <p className="mt-0.5 text-[11px] text-muted">{sellerLine(r)}</p>
          {athlete && <p className="mt-0.5 text-[11px] text-muted">Athlete: {athlete}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-text">{usd(r.item.priceCents)}</p>
          <p className="text-[10px] text-faint">each</p>
        </div>
      </div>
      {r.description && <p className="line-clamp-3 text-xs text-muted">{r.description}</p>}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <StadiumChip tone="info">{kindLabel(r.item.kind)}</StadiumChip>
        <span className="text-muted">{dates}</span>
      </div>
      {notes.length > 0 && <p className="text-[11px] text-faint">{notes.join(" · ")}</p>}
      {action}
    </li>
  );
}
