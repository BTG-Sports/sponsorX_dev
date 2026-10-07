import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { Badge } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { apiListQuery } from "@/lib/list-query";
import {
  OFFER_TABS, READ_ONLY_TIP, expiryCell, mayWriteOffers, money, needsYou, offerTab, partyWords, statusBadge,
  type ApiStaffOfferPage, type OfferTabKey,
} from "@/lib/admin-offers-live";
import { apiFetch, fetchActor } from "@/server/api";

/* --------------------------------------------------------------------------
   Offers — 2S2-FE-03, BTG half (Claude Design Offers.dc.html, views list
   and empty). Formal offers BTG sends athletes, by what they need: drafts and
   unanswered change requests first, then what waits on the athlete, and
   what was accepted, declined or withdrawn.

   P1-FE-31 (2026-10-07): one SERVER-PAGED table per tab — the tab rules
   (lib/admin-offers-live.ts offersByTab) now run on the API, which answers
   the open tab's page and every tab's count.

   Reads  GET /offers?tab=…&page&size   one desk tab's page, with its change requests, and every tab's count
   Writes none here — the offer page and the form (./actions.ts)
   BTG admins, campaign managers and Sales (offer read; Sales can't write);
   ?demo=loading|empty|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/offers";
const TITLE = "Offers";

const EMPTY: Record<OfferTabKey, [string, string]> = {
  needs: ["Nothing needs you", "Change requests and drafts show up here. Everything else is waiting on athletes."],
  drafts: ["No drafts", "Offers you save without sending appear here."],
  waiting: ["Nobody to wait for", "Sent offers appear here until the athlete answers."],
  accepted: ["None accepted yet", "Accepted offers become orders and appear here."],
  declined: ["Nothing declined", "Offers an athlete turns down, or lets expire, appear here."],
  withdrawn: ["Nothing withdrawn", "Offers BTG withdraws appear here."],
};
const NO_TABS: Record<OfferTabKey, number> = { needs: 0, drafts: 0, waiting: 0, accepted: 0, declined: 0, withdrawn: 0 };

const COLUMNS: Column[] = [
  { key: "athlete", label: "Athlete" },
  { key: "campaign", label: "Campaign and sponsor" },
  { key: "pay", label: "Athlete’s pay", num: true },
  { key: "sell", label: <>Sell price <span className="normal-case tracking-normal">(BTG only)</span></>, num: true },
  { key: "expires", label: "Expires" },
  { key: "status", label: "Status" },
  { key: "action", label: "Open", srOnly: true },
];

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
  const sp = await searchParams;
  const tab = offerTab(sp.tab);
  const empty = demo === "empty";
  const [res, who] = await Promise.all([empty ? null : apiFetch(`/offers${apiListQuery(sp, { tab: tab.key })}`), fetchActor()]);
  if (res && !res.ok) throw new Error(`Offers unavailable (${res.status}).`);
  const data: ApiStaffOfferPage = res
    ? ((await res.json()) as ApiStaffOfferPage)
    : { offers: [], page: { page: 1, size: 12, total: 0, pages: 1 }, counts: {}, tabs: NO_TABS };
  const canWrite = who.status === "linked" && mayWriteOffers(who.actor.roles);
  const now = new Date();
  const rows = data.offers;
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

      <TabStrip label="Offer state">
        {OFFER_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={data.tabs[t.key] ?? 0} hot={t.key === "needs"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {rows.length === 0 ? (
        <EmptyState mark="inbox" title={emptyTitle} hint={emptyText} />
      ) : (
        <PagedTable page={data.page} noun="Offers" label={tab.label} columns={COLUMNS}>
          {rows.map((o, i) => {
            const b = statusBadge(o, now);
            const exp = expiryCell(o, now);
            const urgent = needsYou(o);
            return (
              <Tr key={o.id} i={i} tone={urgent ? "warn" : undefined}>
                <Td><Primary sub={partyWords(o.athlete)}>{o.athlete.name}</Primary></Td>
                <Td label="Campaign">
                  {o.campaignName}
                  <span className="block text-[11px] text-muted">{o.sponsorName}</span>
                </Td>
                <Td label="Pay" num>{money(o.compensation)}</Td>
                <Td label="Sell price" num>{money(o.sellPrice)}</Td>
                <Td label="Expires">
                  {exp.day}
                  {exp.sub && <span className={`block text-[11px] ${exp.late ? "text-danger" : "text-muted"}`}>{exp.sub}</span>}
                </Td>
                <Td label="Status"><Badge tone={b.tone}><span aria-hidden="true" className="mr-1">{b.mark}</span>{b.label}</Badge></Td>
                <Td act>
                  <Link href={`${PATH}/${o.id}`} aria-label={`Open the offer for ${o.athlete.name}`}
                    className={`inline-flex min-h-9 items-center justify-center rounded-lg px-3.5 text-xs font-semibold ${urgent ? "bg-primary text-cta-ink hover:bg-primary-soft" : "border border-line text-text hover:bg-surface-2"}`}>
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
