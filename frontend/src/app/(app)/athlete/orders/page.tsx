import Link from "next/link";

import { ArenaChip, ArenaHead, ArenaLink, ArenaSection, ArenaTile, ArenaTiles, ArenaUpdated, type ArenaTone } from "@/components/arena-stage";
import { OrderDecline } from "@/components/order-decline";
import { ServerList } from "@/components/server-pager";
import { EmptyState } from "@/components/states";
import { PagedTable, Primary, Td, Tr, type Column } from "@/components/stage-table";
import { ORDERS_PATH, orderCounts, orderRows, ordersApiQuery } from "@/lib/athlete-orders-live";
import { viewerIsAthlete } from "@/lib/athlete-order-pause";
import type { ApiInvitationPage } from "@/lib/invitations-live";
import { pageOrAll, type PageInfo } from "@/lib/list-query";
import { apiFetch, fetchActor } from "@/server/api";
import { declineOrderAction } from "./actions";

/* --------------------------------------------------------------------------
   Campaign Orders — POL-FE-24. The athlete's Campaign Orders in one list,
   with Accept (on the order page, where the agreement text is hashed) and
   Decline (here, with one confirmation).

   Reads  GET /invitations?state=accepted&page&size   SERVER-PAGED (memory:
          pagination-pattern) — each accepted invitation and the order it
          became {id, state}; null while BTG drafts it. Nothing here reads a
          whole list. A guardian acting for their minor is the athlete here
          (2S1-BE-11); any other login sees the plain explanation.
   Writes POST /orders/:id/transition {to:"REJECTED"}   declineOrderAction

   Marketplace sales are a different thing and stay on /athlete/sales
   ("Sales" in the menu); an accepted offer's order is already signed and
   is reached from the Offers page.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";

const TITLE = "Campaign orders";

const COLUMNS: Column[] = [
  { key: "order", label: "Order" },
  { key: "sponsor", label: "Sponsor · campaign" },
  { key: "offered", label: "Offered", num: true },
  { key: "status", label: "Status" },
  { key: "next", label: "What's next" },
  { key: "actions", label: "Actions", srOnly: true },
];

const CHIP: Record<string, ArenaTone> = { neutral: "ink", primary: "blue", accent: "win", warn: "warn", danger: "danger" };

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function AthleteOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const who = await fetchActor();
  if (who.status !== "linked" || !viewerIsAthlete(who.actor)) {
    return (
      <div className="space-y-6">
        <ArenaHead title={TITLE} />
        <EmptyState mark="inbox" title="Nothing to show for this login" hint="Campaign Orders are the athlete's own. A guardian sees them while acting for the athlete they look after." />
      </div>
    );
  }

  const res = await apiFetch(`/invitations${ordersApiQuery(sp)}`);
  if (!res.ok) throw new Error(`Campaign Orders unavailable (${res.status}).`);
  const list = (await res.json()) as ApiInvitationPage;
  const rows = orderRows(list.invitations);
  const page: PageInfo = pageOrAll(rows, list.page);
  const counts = orderCounts(rows);

  if (page.total === 0) {
    return (
      <div className="space-y-6">
        <ArenaHead title={TITLE} pill={<ArenaUpdated />} lede="A Campaign Order is the signed deal behind an invitation you accepted." />
        <EmptyState
          mark="inbox"
          title="No Campaign Orders yet"
          hint="Accept an invitation and BTG drafts the order with its full terms for you to sign — it lands here."
          action={{ label: "Open invitations", href: "/athlete/invitations" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ArenaHead title={TITLE} pill={<ArenaUpdated />} lede="Every Campaign Order behind an invitation you accepted — read, sign or decline each one.">
        <ArenaTiles cols={3}>
          <ArenaTile label="To sign" value={counts.toSign} format="int" caption="ready for your answer" tone={counts.toSign > 0 ? "flare" : "ink"} delay={0.1} />
          <ArenaTile label="Signed" value={counts.live} format="int" caption="accepted or live" tone="win" delay={0.16} />
          <ArenaTile label="Being drafted" value={counts.drafting} format="int" caption="with BTG" tone="ink" delay={0.22} />
        </ArenaTiles>
      </ArenaHead>

      <ServerList>
        <section aria-labelledby="orders-title">
          <ArenaSection
            title={`Orders · ${page.total}`}
            hint="Accepting happens on the order page, where the agreement text you sign is shown in full."
            action={<ArenaLink href="/athlete/sales">Marketplace sales</ArenaLink>}
            delay={0.3}
          />
          <h2 id="orders-title" className="sr-only">Campaign Orders</h2>
          <PagedTable bare page={page} noun="Orders" label="Campaign Orders" columns={COLUMNS} tone="athlete">
            {rows.map((r, i) => (
              <Tr key={r.key} i={i} tone={r.canAccept ? "warn" : undefined}>
                <Td>
                  <Primary sub={r.acceptedAt ? `accepted ${fmtDate(r.acceptedAt)}` : undefined}>
                    {r.href ? (
                      <Link href={r.href} className="text-athlete hover:underline">{r.jobId} · {r.jobName}</Link>
                    ) : (
                      <>{r.jobId} · {r.jobName}</>
                    )}
                  </Primary>
                </Td>
                <Td label="Sponsor"><Primary sub={r.campaign}>{r.sponsor}</Primary></Td>
                <Td label="Offered" num><span className="sx-arena-num text-sm text-text">{usd(r.offered)}</span></Td>
                <Td label="Status"><ArenaChip tone={CHIP[r.tone] ?? "ink"}>{r.stateLabel}</ArenaChip></Td>
                <Td label="What's next" muted>{r.next}</Td>
                <Td label="Actions">
                  {r.orderId && (r.canAccept || r.canDecline) ? (
                    <div className="flex flex-wrap items-center gap-3">
                      {r.canAccept && r.href && (
                        <Link href={r.href} className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft">
                          Review &amp; accept
                        </Link>
                      )}
                      {r.canDecline && <OrderDecline orderId={r.orderId} decline={declineOrderAction} compact />}
                    </div>
                  ) : r.href ? (
                    <ArenaLink href={r.href}>Open</ArenaLink>
                  ) : (
                    <span className="text-[11px] text-faint">—</span>
                  )}
                </Td>
              </Tr>
            ))}
          </PagedTable>
        </section>
      </ServerList>
      <p className="text-[11px] text-faint">
        Declining can&rsquo;t be undone — BTG would have to send a new order. Orders from accepted offers are already signed and open from{" "}
        <Link href="/athlete/offers" className="text-athlete hover:underline">Offers</Link>.{" "}
        <span className="sr-only">This list is at {ORDERS_PATH}.</span>
      </p>
    </div>
  );
}
