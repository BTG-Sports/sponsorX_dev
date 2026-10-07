import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { PagedTable, Primary, TabLink, TabStrip, Td, Tr, type Column } from "@/components/stage-table";
import { Badge } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
import { apiListQuery } from "@/lib/list-query";
import {
  CLOSED_TABS, closedTab, dayOf, keptCell, kindWords, whyBadge, type ApiClosureList, type ClosureTabKey,
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

   Reads  GET /account-closures?tab=asking|btg|owner|age|deleted&page&size   one tab's page, with every tab's count (2S1-BE-13)
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
  const tab = closedTab(sp.tab);
  const res = demo === "empty" ? null : await apiFetch(`/account-closures${apiListQuery(sp, { tab: tab.key })}`);
  if (res && !res.ok) throw new Error(`Closed accounts unavailable (${res.status}).`);
  const list: ApiClosureList = res ? ((await res.json()) as ApiClosureList) : { closures: [], counts: NO_COUNTS };
  const rows = list.closures;
  const page = list.page ?? { page: 1, size: rows.length || 12, total: rows.length, pages: 1 };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="sx-page-title">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          Every closed account. Files are kept 30 days after closing, then deleted. Accounts BTG closed can only ask to come back; you answer them here.
        </p>
      </div>

      <TabStrip label="Closed account type">
        {CLOSED_TABS.map((t) => (
          <TabLink key={t.key} href={`${PATH}?tab=${t.key}`} on={t.key === tab.key} count={list.counts[t.key] ?? 0} hot={t.key === "asking"}>
            {t.label}
          </TabLink>
        ))}
      </TabStrip>

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
    </div>
  );
}
