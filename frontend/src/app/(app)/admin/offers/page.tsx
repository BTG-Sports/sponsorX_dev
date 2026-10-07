import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, Card } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import {
  OFFER_TABS, READ_ONLY_TIP, expiryCell, mayWriteOffers, money, needsYou, offerTab, offersByTab, partyWords, statusBadge,
  type ApiStaffOffer, type OfferTabKey,
} from "@/lib/admin-offers-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Offers — 2S2-FE-03, BTG half (Claude Design Offers.dc.html, views list
   and empty). Formal offers BTG sends athletes, by what they need: drafts and
   unanswered change requests first, then what waits on the athlete, and
   what was accepted, declined or withdrawn.

   Reads  GET /offers            every offer in BTG's tenant, with its change requests
   Writes none here — the offer page and the form (./actions.ts)
   BTG admins, campaign managers and Sales (offer read; Sales can't write);
   ?demo=loading|empty|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/offers";
const TITLE = "Offers";
const COLS = "md:grid-cols-[1.3fr_1.5fr_6.5rem_7.5rem_6.5rem_11rem_5.5rem]";

const EMPTY: Record<OfferTabKey, [string, string]> = {
  needs: ["Nothing needs you", "Change requests and drafts show up here. Everything else is waiting on athletes."],
  drafts: ["No drafts", "Offers you save without sending appear here."],
  waiting: ["Nobody to wait for", "Sent offers appear here until the athlete answers."],
  accepted: ["None accepted yet", "Accepted offers become orders and appear here."],
  declined: ["Nothing declined", "Offers an athlete turns down, or lets expire, appear here."],
  withdrawn: ["Nothing withdrawn", "Offers BTG withdraws appear here."],
};

export default async function OffersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={3} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const tab = offerTab((await searchParams).tab);
  const empty = demo === "empty";
  const [res, who] = await Promise.all([empty ? null : apiFetch("/offers"), fetchActor()]);
  if (res && !res.ok) throw new Error(`Offers unavailable (${res.status}).`);
  const offers = res ? ((await res.json()) as { offers: ApiStaffOffer[] }).offers : [];
  const canWrite = who.status === "linked" && mayWriteOffers(who.actor.roles);
  const now = new Date();
  const byTab = offersByTab(offers, now);
  const rows = byTab[tab.key];
  const [emptyTitle, emptyText] = EMPTY[tab.key];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="sx-page-title">{TITLE}</h1>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
            Formal offers BTG sends athletes. Terms are fixed once sent: to change one, withdraw it and send a revised offer.
          </p>
        </div>
        {canWrite ? (
          <Link href={`${PATH}/new`} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink hover:bg-primary-soft">
            New offer
          </Link>
        ) : (
          <span aria-disabled="true" title={READ_ONLY_TIP} className="inline-flex min-h-12 cursor-not-allowed items-center justify-center rounded-lg bg-primary px-5 text-sm font-bold text-cta-ink opacity-40">
            New offer
          </span>
        )}
      </div>

      <nav aria-label="Offer state" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 sm:w-fit">
        {OFFER_TABS.map((t) => {
          const on = t.key === tab.key;
          const n = byTab[t.key].length;
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}>
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${t.key === "needs" && n ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <EmptyState mark="inbox" title={emptyTitle} hint={emptyText} />
      ) : (
        <Card className="overflow-hidden p-0">
          <div role="region" aria-label={tab.label}>
            <div className={`hidden gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid ${COLS}`}>
              <span>Athlete</span><span>Campaign and sponsor</span><span className="text-right">Athlete&rsquo;s pay</span>
              <span className="text-right">Sell price <span className="normal-case tracking-normal">(BTG only)</span></span>
              <span>Expires</span><span>Status</span><span className="sr-only">Action</span>
            </div>
            <ul className="divide-y divide-line-soft">
              {rows.map((o) => {
                const b = statusBadge(o, now);
                const exp = expiryCell(o, now);
                const urgent = needsYou(o);
                return (
                  <li key={o.id} className={`grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs md:items-start ${COLS}`}>
                    <span className="flex min-w-0 items-start justify-between gap-2">
                      <span className="min-w-0">
                        <strong className="block text-[13px] font-semibold">{o.athlete.name}</strong>
                        <span className="block text-[11px] text-muted">{partyWords(o.athlete)}</span>
                      </span>
                      <span className="md:hidden"><Badge tone={b.tone}><span aria-hidden="true" className="mr-1">{b.mark}</span>{b.label}</Badge></span>
                    </span>
                    <span className="min-w-0">
                      {o.campaignName}
                      <span className="block text-[11px] text-muted">{o.sponsorName}</span>
                    </span>
                    <span className="tabular-nums md:text-right"><span className="text-muted md:hidden">Pay </span>{money(o.compensation)}</span>
                    <span className="tabular-nums md:text-right"><span className="text-muted md:hidden">Sell </span>{money(o.sellPrice)}</span>
                    <span>
                      <span className="text-muted md:hidden">Expires </span>{exp.day}
                      {exp.sub && <span className={`text-[11px] md:block ${exp.late ? "text-danger" : "text-muted"}`}><span className="md:hidden"> </span>{exp.sub}</span>}
                    </span>
                    <span className="hidden md:block"><Badge tone={b.tone}><span aria-hidden="true" className="mr-1">{b.mark}</span>{b.label}</Badge></span>
                    <span className="md:text-right">
                      <Link href={`${PATH}/${o.id}`} aria-label={`Open the offer for ${o.athlete.name}`}
                        className={`inline-flex min-h-11 w-full items-center justify-center rounded-lg px-3.5 text-xs font-semibold md:min-h-9 md:w-auto ${urgent ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"}`}>
                        Open →
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      )}
    </div>
  );
}
