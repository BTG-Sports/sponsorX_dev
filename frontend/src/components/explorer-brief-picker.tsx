"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FilterChip } from "@/components/filter-kit";
import { ListSearch, PagerRow, PendingList, ServerList, useListNav } from "@/components/server-pager";
import { BRIEF_KEYS, explorerBriefHref } from "@/lib/match-explorer-live";
import type { ApiBrief } from "@/lib/matching-live";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   3S3-FE-01 — which brief the match explorer ranks against. The Matching
   Studio's picker idiom (campaigns/match/brief-picker.tsx), on this route
   and its own keys: one page of GET /briefs (matchable states, desk order),
   searched by ?bq, paged by ?bpage / ?bsize — so the ranked list below keeps
   ?page / ?size. Choosing a brief keeps the picker's place and the kind tab.
   -------------------------------------------------------------------------- */

export function ExplorerBriefPicker(props: { briefs: ApiBrief[]; page: PageInfo; q: string; currentId: string | null }) {
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
        <ListSearch initial={q} param="bq" keys={BRIEF_KEYS} label="Search briefs" placeholder="Objective or sponsor" tone="admin" />
        {q && (
          <FilterChip label="Clear brief search" onClear={() => set({ bq: null }, BRIEF_KEYS)} tone="admin">
            “{q}”
          </FilterChip>
        )}
      </div>
      {page.total === 0 ? (
        <p className="text-[11px] text-muted">No matchable brief fits that search.</p>
      ) : (
        <>
          <PagerRow page={page} noun="Briefs" tone="admin" position="top" filtered={Boolean(q)} keys={BRIEF_KEYS} />
          <PendingList>
            <ul className="flex flex-wrap gap-2">
              {briefs.map((b) => {
                const current = b.id === currentId;
                return (
                  <li key={b.id} className="min-w-0">
                    <Link
                      href={explorerBriefHref(sp.toString(), b.id)}
                      aria-current={current ? "page" : undefined}
                      className={
                        current
                          ? "block max-w-full truncate rounded-full border border-admin/40 bg-admin/10 px-3 py-1 text-[11px] font-medium text-text"
                          : "block max-w-full truncate rounded-full border border-line px-3 py-1 text-[11px] text-muted transition-colors hover:text-text"
                      }
                    >
                      {b.sponsorName} · {b.objective.slice(0, 40)}
                      <span className={`ml-1.5 ${current ? "text-muted" : "text-faint"}`}>{b.state.toLowerCase().replace(/_/g, " ")}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </PendingList>
          <PagerRow page={page} noun="Briefs" tone="admin" position="bottom" keys={BRIEF_KEYS} />
        </>
      )}
    </nav>
  );
}
