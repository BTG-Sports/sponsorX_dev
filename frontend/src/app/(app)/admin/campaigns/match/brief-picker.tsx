"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FilterChip } from "@/components/filter-kit";
import { ListSearch, PagerRow, PendingList, ServerList, useListNav } from "@/components/server-pager";
import { briefHref, type ApiBrief } from "@/lib/matching-live";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   Which brief — the matching desk's picker, SERVER-PAGED (2026-09-29).

   One page of GET /briefs (matchable states, desk order: APPROVED →
   CAMPAIGN_CREATED → QUALIFIED), searched by ?bq over objective and
   sponsor, paged by ?page / ?size. The roster below has its own keys, so
   paging one never moves the other. Choosing a brief keeps the picker's
   place and drops the roster's filters (briefHref).
   -------------------------------------------------------------------------- */

export function BriefPicker(props: { briefs: ApiBrief[]; page: PageInfo; q: string; currentId: string | null }) {
  return (
    <ServerList>
      <Body {...props} />
    </ServerList>
  );
}

function Body({ briefs, page, q, currentId }: { briefs: ApiBrief[]; page: PageInfo; q: string; currentId: string | null }) {
  const { set } = useListNav();
  const sp = useSearchParams();
  return (
    <nav aria-label="Choose a brief" className="space-y-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[11px] font-medium text-muted">Brief</span>
        <ListSearch initial={q} param="bq" label="Search briefs" placeholder="Objective or sponsor" tone="admin" />
        {q && (
          <FilterChip label="Clear brief search" onClear={() => set({ bq: null })} tone="admin">
            “{q}”
          </FilterChip>
        )}
      </div>
      {page.total === 0 ? (
        <p className="text-[11px] text-muted">No matchable brief fits that search.</p>
      ) : (
        <>
          <PagerRow page={page} noun="Briefs" tone="admin" position="top" filtered={Boolean(q)} />
          <PendingList>
            <ul className="flex flex-wrap gap-2">
              {briefs.map((b) => {
                const current = b.id === currentId;
                return (
                  <li key={b.id} className="min-w-0">
                    <Link
                      href={briefHref(sp.toString(), b.id)}
                      aria-current={current ? "page" : undefined}
                      className={
                        current
                          ? "block max-w-full truncate rounded-full border border-admin/40 bg-admin/10 px-3 py-1 text-[11px] font-medium text-text"
                          : "block max-w-full truncate rounded-full border border-line px-3 py-1 text-[11px] text-muted transition-colors hover:text-text"
                      }
                    >
                      {b.sponsorName} · {b.objective.slice(0, 40)}
                      {/* text-muted, not text-faint: faint on the selected
                          row's admin tint was 4.14:1 (check pass C-4, axe). */}
                      <span className={`ml-1.5 ${current ? "text-muted" : "text-faint"}`}>{b.state.toLowerCase().replace(/_/g, " ")}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </PendingList>
          <PagerRow page={page} noun="Briefs" tone="admin" position="bottom" filtered={Boolean(q)} />
        </>
      )}
    </nav>
  );
}
