import type { CSSProperties } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui";
import { SendComingOfAgeLink } from "@/components/coming-of-age-cta";
import type { AgeView } from "@/lib/account-live";

/* --------------------------------------------------------------------------
   The coming-of-age reminder — 2S1-FE-08 (design Account.dc.html, views
   ageAthlete + ageGuardian). Server components; the guardian's CTA is the
   one client island.

   ComingOfAgeReminder is the banner that stays on the athlete's and the
   guardian's pages for the whole 90-day allowance (2S1-BE-12) — on /athlete
   and on the coming-of-age settings page: who can take over, the countdown,
   and the one action that completes it. The athlete's CTA opens their
   coming-of-age page (`uploadPath`, a signed link) to upload a government
   ID; the guardian's sends the athlete that link. PausedActions is the pair
   of cards showing what is paused meanwhile — adding items and new deals —
   with the reason, and what carries on.

   Both take an `AgeView` (lib/account-live comingOfAgeView), from
   GET /coming-of-age/mine. POL-FE-02 — `checking` (the API's
   `checking: true`): the ID is received and BTG is checking it, so the
   banner says so and carries no CTA.
   -------------------------------------------------------------------------- */

const ctaClass = "inline-flex min-h-12 items-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft";

export function ComingOfAgeReminder({ view, seat, uploadPath }: { view: AgeView; seat: "athlete" | "guardian"; uploadPath: string | null }) {
  return (
    <section role={view.checking ? "status" : "alert"} aria-label="Coming of age"
      className={`flex flex-wrap items-center gap-3.5 rounded-xl border px-4.5 py-4 ${view.checking ? "border-primary/40 bg-primary/8" : "border-warn/50 bg-warn/8"}`}>
      <span className="min-w-0 grow basis-60">
        <strong className={`block text-sm ${view.checking ? "text-primary-soft" : "text-warn"}`}>{view.title}</strong>
        <span className="mt-1 block text-sm leading-relaxed">{view.line}</span>
      </span>
      {view.checking ? (
        <Badge tone="primary"><span aria-hidden="true" className="mr-1">●</span>Checking</Badge>
      ) : seat === "guardian" ? (
        <SendComingOfAgeLink label={view.cta} />
      ) : uploadPath ? (
        <Link href={uploadPath} className={ctaClass}>{view.cta}</Link>
      ) : null}
    </section>
  );
}

/** P1-ART-22 — `plate` draws the two sections as arena plates (the
 *  athlete portal); without it the plain cards stay for the public page. */
export function PausedActions({ view, plate = false }: { view: AgeView; plate?: boolean }) {
  const frame = plate ? "sx-arena-plate sx-arena-in px-5 py-4 pl-7" : "rounded-xl border border-line bg-surface px-4.5 py-4";
  const spot = plate ? "" : undefined;
  const skin = (delay: string) => (plate ? ({ "--tone": "var(--sx-warn)", "--sx-reveal-delay": delay } as CSSProperties) : undefined);
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <section aria-label="Items" data-spot={spot} style={skin("0.2s")} className={`flex flex-col gap-2.5 ${frame}`}>
        <h2 className="text-sm font-semibold">Items</h2>
        <button type="button" disabled aria-describedby="age-why" title={view.pausedItems}
          className="min-h-11 cursor-not-allowed self-start rounded-lg border border-line px-4 text-xs font-medium text-text opacity-45">
          Add item
        </button>
        <p id="age-why" className="text-xs leading-relaxed text-warn"><span aria-hidden="true">! </span>{view.pausedItems}</p>
        <p className="text-xs leading-relaxed text-muted">Items already on sale stay on sale.</p>
      </section>
      <section aria-label="Deals" data-spot={spot} style={skin("0.26s")} className={`flex flex-col gap-2.5 ${frame}`}>
        <h2 className="text-sm font-semibold">New deals</h2>
        <p><Badge tone="warn"><span aria-hidden="true" className="mr-1">Ⅱ</span>Paused</Badge></p>
        <p className="text-xs leading-relaxed text-warn"><span aria-hidden="true">! </span>{view.pausedDeals}</p>
        <p className="text-xs leading-relaxed text-muted">Agreed orders carry on as normal.</p>
      </section>
    </div>
  );
}
