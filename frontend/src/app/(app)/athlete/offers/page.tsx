import Link from "next/link";

import { EmptyState } from "@/components/states";
import { Badge, Card, SectionHeading } from "@/components/ui";
import { groupOffers, type ApiOffer, type OfferRow } from "@/lib/offer-live";
import { apiFetch } from "@/server/api";
import { requirePortalAccess } from "@/server/portal";

/* --------------------------------------------------------------------------
   Offers — 2S2-FE-03. Athlete portal.

   The formal campaign offers BTG has sent: open ones first (soonest expiry
   on top), then everything answered, withdrawn or lapsed. Each opens the
   full terms at /athlete/offers/[id], where the athlete accepts or
   declines.

   Live only: GET /offers (offer read "own" — the athlete's own offers; a
   guardian's login gets 403, explained below). Other failures throw to the
   error page. DRAFT offers are left out: they are BTG's until sent (the API
   returns them to the athlete anyway — a gap reported upstream). No
   "request a change": the API takes ACCEPT or DECLINE only.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

function OfferList({ rows }: { rows: OfferRow[] }) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-line-soft">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/athlete/offers/${encodeURIComponent(r.id)}`}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{r.title}</span>
                <span className="mt-0.5 block text-[11px] text-muted">
                  {r.deliverables} deliverable{r.deliverables === 1 ? "" : "s"} · {r.when}
                </span>
              </span>
              <span className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{r.pay}</span>
                <Badge tone={r.tone}>{r.label}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default async function AthleteOffersPage() {
  await requirePortalAccess("athlete");

  const heading = (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">Offers</h1>
      <p className="mt-1 text-xs text-muted">
        Campaign offers from BTG, with the full terms: pay, deliverables, usage rights and exclusivity.
      </p>
    </div>
  );

  const res = await apiFetch("/offers");
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="inbox"
          title="Offers are answered by the athlete"
          hint="An offer is accepted or declined from the athlete's own login. If they're under 18, their verified guardian's authorisation is recorded with it."
        />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Offers unavailable (${res.status}).`);
  const { offers } = (await res.json()) as { offers: ApiOffer[] };
  const { open, answered } = groupOffers(offers);

  if (open.length === 0 && answered.length === 0) {
    return (
      <div className="space-y-6">
        {heading}
        <EmptyState
          mark="inbox"
          title="No offers yet"
          hint="When BTG matches you to a campaign, the full terms land here for you to accept or decline."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {heading}
      <section>
        <SectionHeading title="Open" hint={open.length ? "Waiting for your answer" : undefined} />
        {open.length ? (
          <OfferList rows={open} />
        ) : (
          <Card>
            <p className="text-xs text-muted">Nothing waiting for you right now.</p>
          </Card>
        )}
      </section>
      {answered.length > 0 && (
        <section>
          <SectionHeading title="Answered and closed" />
          <OfferList rows={answered} />
        </section>
      )}
    </div>
  );
}
