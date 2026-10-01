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
   GET /coming-of-age/mine.
   -------------------------------------------------------------------------- */

const ctaClass = "inline-flex min-h-12 items-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft";

export function ComingOfAgeReminder({ view, seat, uploadPath }: { view: AgeView; seat: "athlete" | "guardian"; uploadPath: string | null }) {
  return (
    <section role="alert" aria-label="Coming of age" className="flex flex-wrap items-center gap-3.5 rounded-xl border border-warn/50 bg-warn/8 px-4.5 py-4">
      <span className="min-w-0 grow basis-60">
        <strong className="block text-sm text-warn">{view.title}</strong>
        <span className="mt-1 block text-sm leading-relaxed">{view.line}</span>
      </span>
      {seat === "guardian" ? (
        <SendComingOfAgeLink label={view.cta} />
      ) : uploadPath ? (
        <Link href={uploadPath} className={ctaClass}>{view.cta}</Link>
      ) : null}
    </section>
  );
}

export function PausedActions({ view }: { view: AgeView }) {
  return (
    <div className="grid gap-3.5 sm:grid-cols-2">
      <section aria-label="Items" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4.5 py-4">
        <h2 className="text-sm font-semibold">Items</h2>
        <button type="button" disabled aria-describedby="age-why" title={view.pausedItems}
          className="min-h-11 cursor-not-allowed self-start rounded-lg border border-line px-4 text-xs font-medium text-text opacity-45">
          Add item
        </button>
        <p id="age-why" className="text-xs leading-relaxed text-warn"><span aria-hidden="true">! </span>{view.pausedItems}</p>
        <p className="text-xs leading-relaxed text-muted">Items already on sale stay on sale.</p>
      </section>
      <section aria-label="Deals" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface px-4.5 py-4">
        <h2 className="text-sm font-semibold">New deals</h2>
        <p><Badge tone="warn"><span aria-hidden="true" className="mr-1">Ⅱ</span>Paused</Badge></p>
        <p className="text-xs leading-relaxed text-warn"><span aria-hidden="true">! </span>{view.pausedDeals}</p>
        <p className="text-xs leading-relaxed text-muted">Agreed orders carry on as normal.</p>
      </section>
    </div>
  );
}
