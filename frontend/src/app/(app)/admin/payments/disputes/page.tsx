import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { KpiTile } from "@/components/ops-stage";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { EmptyState, SkeletonRows } from "@/components/states";
import { Badge } from "@/components/ui";
import { demoState } from "@/lib/demo";
import {
  DISPUTE_TABS, EMPTY_DISPUTE_LIST, amountWords, disputeTab, providerWords, reasonWords, stateLabel, stateTone, type ApiDisputeList,
} from "@/lib/disputes-live";
import { apiListQuery } from "@/lib/list-query";
import { agoLabel } from "@/lib/marketplace-ops-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Disputes — 2S5-FE-08. A sponsor disputed a card payment with the provider
   (2S5-BE-03): its order's money is frozen until a BTG admin resolves it to
   the outcome the provider reports. A dashboard on the Mission Control
   stage: small title, four tiles from the API's counts, then the work.

   Reads  GET /disputes?state&page&size   { counts, disputes, page? }
   BTG admin and Finance (paymentDispute read). The actions live on the
   dispute's own page (./[id]). ?demo=loading|empty|error renders the
   branded states. The page tolerates an API without `page`.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/payments/disputes";
const TITLE = "Disputes";

export default async function DisputesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
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
  const tab = disputeTab(sp.tab);
  const empty = demo === "empty";
  const res = empty ? null : await apiFetch(`/disputes${apiListQuery(sp, { state: tab.state })}`);
  if (res?.status === 403) return <NotInRole path={PATH} title={TITLE} roles={["BTG_ADMIN", "FINANCE"]} />;
  if (res && !res.ok) throw new Error(`Disputes unavailable (${res.status}).`);
  const list: ApiDisputeList = res ? ((await res.json()) as ApiDisputeList) : EMPTY_DISPUTE_LIST;
  const rows = list.disputes;
  const page = list.page ?? { page: 1, size: rows.length || 12, total: rows.length, pages: 1 };
  const now = new Date().getTime();
  const waiting = list.counts.OPEN + list.counts.UNDER_REVIEW;

  const columns: Column[] = [
    { key: "order", label: "Order" },
    { key: "amount", label: "Amount", num: true },
    { key: "reason", label: "Reason" },
    { key: "opened", label: "Opened" },
    { key: "state", label: "State" },
    { key: "provider", label: "Provider" },
    { key: "action", label: "Action", srOnly: true },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          Card payments sponsors disputed with the provider. A dispute freezes its order’s money — no payout or refund moves — until a BTG admin resolves it to the provider’s outcome.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile label="Open" value={list.counts.OPEN} caption={list.counts.OPEN ? "waiting to be taken for review" : "nothing waiting"} tone={list.counts.OPEN ? "orange" : "green"} delay={0.1} />
        <KpiTile label="Under review" value={list.counts.UNDER_REVIEW} caption={waiting ? `${waiting} order${waiting === 1 ? "" : "s"} frozen` : "no money frozen"} tone="blue" delay={0.16} />
        <KpiTile label="Won" value={list.counts.WON} caption="money unfrozen" tone="green" delay={0.22} />
        <KpiTile label="Lost" value={list.counts.LOST} caption="books reversed" tone="cyan" delay={0.28} />
      </dl>

      <TabStrip label="Disputes">
        {DISPUTE_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={list.counts[t.state]} hot={t.key === "open"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {rows.length === 0 ? (
        <EmptyState mark="inbox" title={`No ${tab.label.toLowerCase()} disputes`}
          hint={tab.key === "open" ? "Nothing waiting — every dispute has been taken for review or resolved." : tab.key === "review" ? "Disputes BTG has taken for review appear here until a BTG admin resolves them." : `Disputes resolved as ${tab.label.toLowerCase()} appear here.`} />
      ) : (
        <PagedTable page={page} noun="Disputes" label={`Disputes · ${tab.label}`} columns={columns}>
          {rows.map((d, i) => (
            <Tr key={d.id} i={i} tone={d.state === "OPEN" ? "warn" : undefined}>
              <Td><Primary sub={d.sponsorName}>{d.orderRef}</Primary></Td>
              <Td label="Amount" num className="font-semibold">{amountWords(d)}</Td>
              <Td label="Reason" muted>{reasonWords(d)}</Td>
              <Td label="Opened" muted><span title={d.openedAt}>{agoLabel(d.openedAt, now)}</span></Td>
              <Td label="State"><Badge tone={stateTone(d.state)}>{stateLabel(d.state)}</Badge></Td>
              <Td label="Provider" muted>{providerWords(d)}</Td>
              <Td act>
                <Link href={`${PATH}/${encodeURIComponent(d.id)}`} aria-label={`Open the ${d.orderRef} dispute`}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-line px-3.5 text-sm font-medium text-text hover:bg-surface-2 md:min-h-9 md:w-auto md:text-xs">
                  Open →
                </Link>
              </Td>
            </Tr>
          ))}
        </PagedTable>
      )}
    </div>
  );
}
