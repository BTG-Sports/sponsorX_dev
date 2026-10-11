import Link from "next/link";

import { ArenaChip, ArenaHead, ArenaTile, ArenaTiles, at, type ArenaTone } from "@/components/arena-stage";
import { EmptyState } from "@/components/states";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import type { SearchParams } from "@/lib/list-query";
import {
  OFFER_TABS, expiresSoon, hoursToExpiry, offerPage, offerTab, offersApiQuery, toOfferRow,
  type ApiOfferPage, type OfferTabKey, type Tone,
} from "@/lib/offer-live";
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

   P1-ART-22 (2026-10-11) — redrawn on the Arena (components/arena-stage.tsx)
   as a dashboard and made SERVER-PAGED (memory: pagination-pattern). The
   page no longer fetches every offer and groups it in the browser: it reads
   `?tab` (open | closed, default open) and `?page&size` from the URL and
   asks GET /offers?page=&size=&tab= for exactly that page, expecting
   `{ offers, page, counts: { open, closed } }` (lib/offer-live.ts offerPage
   tolerates an API that still answers the unpaged shape). The KPI plates
   are the API's two counts, the tab strip carries them, and the list is a
   PagedTable (athlete tone, controls above and below, 12/24/60). A row that
   expires within 48 hours is toned as needing you now. The guardian 403
   explanation and the empty state are kept.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const PATH = "/athlete/offers";
const TITLE = "Offers";
const LEDE = "Campaign offers from BTG, with the full terms: pay, deliverables, usage rights and exclusivity.";

const COLUMNS: Column[] = [
  { key: "offer", label: "Offer" },
  { key: "deliverables", label: "Deliverables", num: true },
  { key: "pay", label: "Pay", num: true },
  { key: "when", label: "Expires" },
  { key: "status", label: "Status" },
  { key: "action", label: "Open", srOnly: true },
];

const EMPTY: Record<OfferTabKey, [string, string]> = {
  open: ["Nothing waiting for you", "When BTG matches you to a campaign, the full terms land here for you to accept or decline."],
  closed: ["Nothing closed yet", "Offers you've accepted or declined, and any BTG withdrew or let lapse, stay here for the record."],
};

/** The status chip's tone on the arena: an open offer is a flare (needs you). */
const CHIP_TONE: Record<Tone, ArenaTone> = { primary: "blue", accent: "win", neutral: "ink", danger: "danger", warn: "flare" };

export default async function AthleteOffersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePortalAccess("athlete");
  const sp = await searchParams;
  const tab = offerTab(sp);
  const now = new Date();
  const readAt = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const pill = `Postgres · read ${readAt}`;

  const res = await apiFetch(`/offers${offersApiQuery(sp)}`);
  if (res.status === 403) {
    return (
      <div className="space-y-6">
        <ArenaHead title={TITLE} pill={pill} lede={LEDE} />
        <EmptyState
          mark="inbox"
          title="Offers are answered by the athlete"
          hint="An offer is accepted or declined from the athlete's own login. If they're under 18, their verified guardian's authorisation is recorded with it."
        />
      </div>
    );
  }
  if (!res.ok) throw new Error(`Offers unavailable (${res.status}).`);
  const { rows, page, counts } = offerPage((await res.json()) as ApiOfferPage, now);

  if (counts.open === 0 && counts.closed === 0) {
    return (
      <div className="space-y-6">
        <ArenaHead title={TITLE} pill={pill} lede={LEDE} />
        <EmptyState
          mark="inbox"
          title="No offers yet"
          hint="When BTG matches you to a campaign, the full terms land here for you to accept or decline."
        />
      </div>
    );
  }

  const [emptyTitle, emptyHint] = EMPTY[tab];
  const label = OFFER_TABS.find((t) => t.key === tab)!.label;

  return (
    <div className="space-y-6">
      <ArenaHead title={TITLE} pill={pill} lede={LEDE}>
        {/* The KPI row: the API's own counts for both tabs, never the rows in view. */}
        <ArenaTiles cols={2}>
          <ArenaTile
            label="Open"
            value={counts.open}
            caption={counts.open ? "waiting for your answer · soonest expiry first" : "nothing waiting for you"}
            tone={counts.open ? "flare" : "ink"}
            href={PATH}
            delay={0.1}
          />
          <ArenaTile
            label="Closed"
            value={counts.closed}
            caption={counts.closed ? "accepted, declined, withdrawn or expired" : "nothing answered yet"}
            tone="blue"
            href={`${PATH}?tab=closed`}
            delay={0.16}
          />
        </ArenaTiles>
      </ArenaHead>

      <div className="sx-arena-in" style={at(0.22)}>
        <TabStrip label="Offer state">
          {OFFER_TABS.map((t) => (
            <TabLink key={t.key} href={t.key === "open" ? PATH : `${PATH}?tab=${t.key}`} on={t.key === tab} count={counts[t.key]} hot={t.key === "open"}>
              {t.label}
            </TabLink>
          ))}
        </TabStrip>
      </div>

      {rows.length === 0 ? (
        <EmptyState mark="inbox" title={emptyTitle} hint={emptyHint} />
      ) : (
        <PagedTable page={page} noun="Offers" label={`${label} offers`} columns={COLUMNS} tone="athlete">
          {rows.map((o, i) => {
            const r = toOfferRow(o, now);
            const soon = expiresSoon(o, now);
            const hours = hoursToExpiry(o, now);
            return (
              <Tr key={o.id} i={i} tone={soon ? "warn" : undefined}>
                <Td>
                  <Primary sub={r.campaign}>{r.sponsor}</Primary>
                </Td>
                <Td label="Deliverables" num>
                  <span className="sx-arena-num">{r.deliverables}</span>
                </Td>
                <Td label="Pay" num>
                  <span className="sx-arena-num text-text">{r.pay}</span>
                </Td>
                <Td label="Expires">
                  {r.when}
                  {soon && (
                    <span className="block text-[11px] font-medium text-warn">
                      {hours <= 0 ? "under an hour left" : hours === 1 ? "1 hour left" : `${hours} hours left`}
                    </span>
                  )}
                </Td>
                <Td label="Status">
                  <ArenaChip tone={CHIP_TONE[r.tone]}>{r.label}</ArenaChip>
                </Td>
                <Td act>
                  <Link
                    href={`${PATH}/${encodeURIComponent(o.id)}`}
                    aria-label={`Open the offer from ${r.sponsor} for ${r.campaign}`}
                    className={`inline-flex min-h-9 items-center justify-center rounded-full px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-athlete ${
                      r.status === "open" ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"
                    }`}
                  >
                    Open →
                  </Link>
                </Td>
              </Tr>
            );
          })}
        </PagedTable>
      )}
    </div>
  );
}
