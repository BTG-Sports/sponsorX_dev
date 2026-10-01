import Link from "next/link";

import { ShopListingCard } from "@/components/shop-listing-card";
import type { ApiSearchResult } from "@/lib/shop-live";

/* --------------------------------------------------------------------------
   2S3-FE-01 / -02 — "Preview as a sponsor sees it", the body both sellers'
   preview routes share (/property/listings/[id]/preview and
   /athlete/listings/[id]/preview).

   The card is the shop's own ShopListingCard, in the shop's own grid, with
   the button a sponsor admin would click ("Add to cart") drawn DISABLED —
   a preview never writes. The banner says plainly that it is a preview,
   and what still stands between this listing and a sponsor.
   -------------------------------------------------------------------------- */

const backLink = "text-xs text-primary hover:underline";

export function ListingShopPreview({
  result,
  headline,
  notes,
  gaps,
  back,
}: {
  result: ApiSearchResult;
  headline: string;
  notes: string[];
  /** Parts a best-effort read couldn't fill, e.g. "the athlete's line". */
  gaps: string[];
  back: { href: string; label: string };
}) {
  return (
    <div className="space-y-6">
      <div>
        <Link href={back.href} className={backLink}>
          ← {back.label}
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight break-words">{result.title}</h1>
      </div>

      <section role="status" aria-label="Preview" className="rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-xs">
        <p className="font-semibold text-primary">{headline}</p>
        <p className="mt-1 text-muted">
          This is the card sponsors get in the shop, drawn from what you&rsquo;ve saved — save any changes in the editor
          first. Buttons are switched off here.
        </p>
        {notes.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-text">
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {gaps.length > 0 && (
          <p className="mt-2 text-warn">
            Couldn&rsquo;t read {gaps.join(" or ")} just now, so that part may differ in the shop.
          </p>
        )}
        <p className="mt-2 text-[11px] text-faint">
          Sponsors in a brand category you&rsquo;ve restricted never see it.
        </p>
      </section>

      <section aria-label="In the shop" className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-faint">In the shop</p>
        <ul className="grid gap-3 lg:grid-cols-2">
          <ShopListingCard
            result={result}
            action={
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled
                  title="Preview only — sponsors add it to their cart once it's on sale."
                  className="cursor-not-allowed rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-cta-ink opacity-40"
                >
                  Add to cart
                </button>
              </div>
            }
          />
        </ul>
      </section>

      <Link href={back.href} className={backLink}>
        ← {back.label}
      </Link>
    </div>
  );
}
