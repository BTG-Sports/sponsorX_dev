import Link from "next/link";

import { NotInRole, staffWithoutAccess } from "@/components/not-in-role";
import { Badge, Card } from "@/components/ui";
import { EmptyState, SkeletonRows } from "@/components/states";
import { demoState } from "@/lib/demo";
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

   Reads  GET /account-closures?tab=asking|btg|owner|age|deleted   one tab, with every tab's count (2S1-BE-13)
   Each row opens /admin/closed-accounts/:id.
   BTG admins only (accountClosure read); ?demo=loading|empty|error.
   -------------------------------------------------------------------------- */

export const dynamic = "force-dynamic";
const PATH = "/admin/closed-accounts";
const TITLE = "Closed accounts";
const COLS = "md:grid-cols-[1.3fr_1fr_1.4fr_5rem_9rem_7rem_5rem]";
const NO_COUNTS: Record<ClosureTabKey, number> = { asking: 0, btg: 0, owner: 0, age: 0, deleted: 0 };

export default async function ClosedAccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const demo = await demoState(searchParams);
  if (demo === "loading") {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <SkeletonRows rows={4} />
      </div>
    );
  }
  if (demo === "error") throw new Error("Demo error state");

  const lacking = await staffWithoutAccess(PATH);
  if (lacking) return <NotInRole path={PATH} title={TITLE} roles={lacking} />;
  const tab = closedTab((await searchParams).tab);
  const res = demo === "empty" ? null : await apiFetch(`/account-closures?tab=${tab.key}`);
  if (res && !res.ok) throw new Error(`Closed accounts unavailable (${res.status}).`);
  const list: ApiClosureList = res ? ((await res.json()) as ApiClosureList) : { closures: [], counts: NO_COUNTS };
  const rows = list.closures;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{TITLE}</h1>
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted">
          Every closed account. Files are kept 30 days after closing, then deleted. Accounts BTG closed can only ask to come back; you answer them here.
        </p>
      </div>

      <nav aria-label="Closed account type" className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 sm:w-fit">
        {CLOSED_TABS.map((t) => {
          const on = t.key === tab.key;
          const n = list.counts[t.key] ?? 0;
          return (
            <Link key={t.key} href={`${PATH}?tab=${t.key}`} aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${on ? "bg-primary/15 text-text" : "text-muted hover:text-text"}`}>
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${t.key === "asking" && n ? "bg-warn/15 text-warn" : "bg-surface-2"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>

      <section aria-label="Closed accounts">
        {rows.length === 0 ? (
          <EmptyState mark="inbox" title={tab.empty[0]} hint={tab.empty[1]} />
        ) : (
          <Card className="overflow-hidden p-0">
            <div className={`hidden gap-x-3 border-b border-line-soft px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-faint md:grid ${COLS}`}>
              <span>Name</span><span>Kind</span><span>Why it closed</span><span>Closed</span><span>Files kept until</span><span>Asked to come back</span><span className="sr-only">Action</span>
            </div>
            <ul className="divide-y divide-line-soft">
              {rows.map((r) => {
                const why = whyBadge(r);
                const kept = keptCell(r);
                const asked = r.requestedAt ? dayOf(r.requestedAt) : "—";
                return (
                  <li key={r.id} className={`grid gap-x-3 gap-y-1.5 px-4 py-3.5 text-xs md:items-center ${COLS}`}>
                    <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 md:block">
                      <strong className="text-[13px] font-semibold">{r.name}</strong>
                      <span className="text-[11px] text-muted md:hidden">{kindWords(r.kind)}</span>
                    </span>
                    <span className="hidden text-muted md:block">{kindWords(r.kind)}</span>
                    <span><Badge tone={why.tone}><span aria-hidden="true" className="mr-1">{why.mark}</span>{why.label}</Badge></span>
                    <span className="hidden md:block">{dayOf(r.closedAt)}</span>
                    <span className="hidden md:block">
                      {kept.date}
                      {kept.left && <span className="block text-[11px] text-muted">{kept.left}</span>}
                    </span>
                    <span className="hidden md:block">{asked}</span>
                    {/* Phone (CA-1-phone): the dates on two lines. */}
                    <span className="text-[11px] text-muted md:hidden">
                      Closed {dayOf(r.closedAt)} · {r.state === "PURGED" ? kept.date : `files kept until ${kept.date}${kept.left ? ` (${kept.left})` : ""}`}
                    </span>
                    <span className="text-[11px] text-muted md:hidden">Asked to come back: {asked}</span>
                    <span className="md:text-right">
                      <Link href={`${PATH}/${r.id}`} aria-label={`Open ${r.name}`}
                        className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-cta-ink hover:bg-primary-soft">
                        Open →
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
