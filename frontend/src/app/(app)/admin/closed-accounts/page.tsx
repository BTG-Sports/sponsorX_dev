import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PagedTable, Primary, StageTable, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { Badge, StatTile } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { apiListQuery } from "@/lib/list-query";
import {
  CLOSED_TABS, CLOSING_TAB, closedTab, dayOf, deskTab, heldSinceLine, heldWhyCell, keptCell, kindWords, whyBadge,
  type ApiClosureList, type ApiClosureRequestList, type ClosureTabKey,
} from "@/lib/closed-accounts-live";
import { apiFetch } from "@/server/api";

/* --------------------------------------------------------------------------
   Closed accounts — 2S1-FE-08, BTG half (Claude Design
   ClosedAccounts.dc.html, CA-1 the list, CA-1-phone, CA-9 an empty tab).
   Every closed account. Files are kept 30 days after closing, then deleted.
   An account its owner closed comes back by itself; one BTG closed can only
   ask, and BTG answers it here.

   P1-FE-31 (2026-10-07): one SERVER-PAGED table per tab (the house pager)
   in place of the newest 100.

   POL-FE-11 (2026-10-29): a first tab, "Waiting to close" — closures HELD
   for BTG because a live deal, money with no payout account, or a minor
   still in a guardian's care was left behind. Oldest first; each opens
   /admin/closed-accounts/requests/:id, where Close now and Decline are.
   The desk is a dashboard: the counts first, then the work.

   Reads  GET /account-closure-requests                                       held closures, oldest first (POL-BE-11)
          GET /account-closures?tab=asking|btg|owner|age|deleted&page&size   one tab's page, with every tab's count (2S1-BE-13)
   Each row opens /admin/closed-accounts/:id.
   BTG admins only (accountClosure read); ?demo=loading|empty|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/closed-accounts";
const TITLE = "Closed accounts";
const NO_COUNTS: Record<ClosureTabKey, number> = { asking: 0, btg: 0, owner: 0, age: 0, deleted: 0 };

const COLUMNS: Column[] = [
  { key: "name", label: "Name" },
  { key: "kind", label: "Kind" },
  { key: "why", label: "Why it closed" },
  { key: "closed", label: "Closed" },
  { key: "kept", label: "Files kept until" },
  { key: "asked", label: "Asked to come back" },
  { key: "action", label: "Open", srOnly: true },
];

const HELD_COLUMNS: Column[] = [
  { key: "name", label: "Name" },
  { key: "kind", label: "Kind" },
  { key: "why", label: "Why it’s held" },
  { key: "asked", label: "Asked" },
  { key: "action", label: "Open", srOnly: true },
];

export default async function ClosedAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="sx-page-title">{TITLE}</h1>
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const sp = await searchParams;
  const tabKey = deskTab(sp.tab);
  const closing = tabKey === CLOSING_TAB.key;
  const tab = closedTab(sp.tab);
  const [res, heldRes] = demo === "empty"
    ? [null, null]
    : await Promise.all([apiFetch(`/account-closures${apiListQuery(sp, { tab: tab.key })}`), apiFetch("/account-closure-requests")]);
  if (res && !res.ok) throw new Error(`Closed accounts unavailable (${res.status}).`);
  if (heldRes && !heldRes.ok) throw new Error(`Closures waiting to close unavailable (${heldRes.status}).`);
  const list: ApiClosureList = res ? ((await res.json()) as ApiClosureList) : { closures: [], counts: NO_COUNTS };
  const held = heldRes ? ((await heldRes.json()) as ApiClosureRequestList).requests : [];
  const rows = list.closures;
  const page = list.page ?? { page: 1, size: rows.length || 12, total: rows.length, pages: 1 };
  const oldest = held[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          Every closed account, and the ones waiting to close. Files are kept 30 days after closing, then deleted. Accounts BTG closed can only ask to come back; you answer them here.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Waiting to close" value={String(held.length)} sub={oldest ? `oldest ${dayOf(oldest.requestedAt)} · you settle the deals first` : "a live deal holds a closure here"} />
        <StatTile label="Asking to come back" value={String(list.counts.asking ?? 0)} sub="closed by BTG · you answer" />
        <StatTile label="Closed by the owner" value={String(list.counts.owner ?? 0)} sub="reactivate by themselves for 30 days" />
        <StatTile label="Closed by BTG" value={String(list.counts.btg ?? 0)} sub="rejected · can only ask" />
      </div>

      <TabStrip label="Closed account type">
        <TabLink href={`${PATH}?tab=${CLOSING_TAB.key}`} on={closing} count={held.length} hot>
          {CLOSING_TAB.label}
        </TabLink>
        {CLOSED_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={!closing && t.key === tab.key} count={list.counts[t.key] ?? 0} hot={t.key === "asking"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

      {closing ? (
        <section aria-label="Waiting to close">
          {held.length === 0 ? (
            <EmptyState mark="inbox" title={CLOSING_TAB.empty[0]} hint={CLOSING_TAB.empty[1]} />
          ) : (
            <StageTable label="Closures waiting for BTG, oldest first" columns={HELD_COLUMNS}>
              {held.map((r, i) => {
                const why = heldWhyCell(r.holdReasons);
                return (
                  <Tr key={r.id} i={i} tone="warn">
                    <Td><Primary sub={r.reason ? `“${r.reason}”` : undefined}>{r.accountName || "An account"}</Primary></Td>
                    <Td label="Kind" muted>{kindWords(r.account)}</Td>
                    <Td label="Why it’s held">
                      {why.first}
                      {why.more && <span className="block text-[11px] text-muted">{why.more}</span>}
                    </Td>
                    <Td label="Asked" muted>{heldSinceLine(r.requestedAt)}</Td>
                    <Td act>
                      <Link href={`${PATH}/requests/${encodeURIComponent(r.id)}`} aria-label={`Open ${r.accountName || "the request"}`}
                        className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft">
                        Open →
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </StageTable>
          )}
        </section>
      ) : (
        <section aria-label="Closed accounts">
          {rows.length === 0 ? (
            <EmptyState mark="inbox" title={tab.empty[0]} hint={tab.empty[1]} />
          ) : (
            <PagedTable page={page} noun="Accounts" label={`${tab.label} closed accounts`} columns={COLUMNS}>
              {rows.map((r, i) => {
                const why = whyBadge(r);
                const kept = keptCell(r);
                const asked = r.requestedAt ? dayOf(r.requestedAt) : "—";
                return (
                  <Tr key={r.id} i={i} tone={tab.key === "asking" ? "warn" : undefined}>
                    <Td><Primary>{r.name}</Primary></Td>
                    <Td label="Kind" muted>{kindWords(r.kind)}</Td>
                    <Td label="Why"><Badge tone={why.tone}><span aria-hidden="true" className="mr-1">{why.mark}</span>{why.label}</Badge></Td>
                    <Td label="Closed" muted>{dayOf(r.closedAt)}</Td>
                    <Td label="Files kept until">
                      {kept.date}
                      {kept.left && <span className="block text-[11px] text-muted">{kept.left}</span>}
                    </Td>
                    <Td label="Asked to come back" muted>{asked}</Td>
                    <Td act>
                      <Link href={`${PATH}/${r.id}`} aria-label={`Open ${r.name}`}
                        className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft">
                        Open →
                      </Link>
                    </Td>
                  </Tr>
                );
              })}
            </PagedTable>
          )}
        </section>
      )}
    </div>
  );
}
