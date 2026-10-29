import Link from "next/link";
import type { ReactNode } from "react";

import { PendingList } from "@/components/server-pager";
import { StadiumBar, StadiumChip, StadiumPanel } from "@/components/stadium-stage";
import { PagedTable, Primary, Td, Tr, type Column } from "@/components/stage-table";
import { formatCount } from "@/lib/format-count";
import type { PageInfo } from "@/lib/list-query";
import { isBehind, windowLabel, type ApiCampaign } from "@/lib/sponsor-live";
import { campaignWord } from "@/lib/sponsor-words";

/* --------------------------------------------------------------------------
   The sponsor's campaign table (P1-ART-23) — one server page of
   GET /campaigns, shared by the dashboard (/sponsor) and the Campaigns page
   so the two lists can't drift. Each page keeps its own search, filters,
   tabs and empty-state wording; this renders the rows (or that empty text)
   inside the caller's <ServerList>.

   "Spent" shows only when the role can read money: the invoiced amount, or
   the agreed amount marked "Agreed" before anything is invoiced.
   -------------------------------------------------------------------------- */

const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function SponsorCampaignTable({
  rows,
  page,
  now,
  filtered,
  empty,
  needsYou = false,
}: {
  rows: ApiCampaign[];
  page: PageInfo;
  now: Date;
  filtered: boolean;
  /** What to say when this page has no rows. */
  empty: ReactNode;
  /** POL-FE-20 — the rows are the API's ?review=true page: every one has a
   *  post waiting for the sponsor's OK, so each says so and links to it. */
  needsYou?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <PendingList>
        <StadiumPanel>
          <p className="text-sm text-muted">{empty}</p>
        </StadiumPanel>
      </PendingList>
    );
  }

  const showMoney = rows.some((r) => r.contracted !== undefined);
  const columns: Column[] = [
    { key: "campaign", label: "Campaign" },
    { key: "status", label: "Status" },
    { key: "posts", label: "Posts delivered" },
    ...(showMoney ? [{ key: "spent", label: "Spent", num: true }] : []),
    { key: "ends", label: "Dates" },
    { key: "act", label: "Results", srOnly: true },
  ];

  return (
    <PagedTable bare tone="sponsor" page={page} noun="Campaigns" filtered={filtered} label="Your campaigns" columns={columns}>
      {rows.map((c, i) => {
        const word = campaignWord(c.state);
        const { done, total: due } = c.deliverables;
        const behind = isBehind(c, now);
        return (
          <Tr key={c.id} i={i}>
            <Td>
              <Link href={`/sponsor/campaigns/${encodeURIComponent(c.id)}`} className="block rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sponsor">
                <Primary sub={`${c.athletes} ${c.athletes === 1 ? "athlete" : "athletes"} · ${c.package?.name ?? "Custom package"}`}>{c.name}</Primary>
              </Link>
            </Td>
            <Td label="Status">
              <span className="flex flex-wrap gap-1.5">
                <StadiumChip tone={word.tone}>{word.text}</StadiumChip>
                {needsYou && <StadiumChip tone="you">Needs your OK</StadiumChip>}
                {behind && <StadiumChip tone="late">Behind</StadiumChip>}
              </span>
            </Td>
            <Td label="Posts delivered">
              {due ? (
                <span className="flex items-center gap-2">
                  <span className="block w-20">
                    <StadiumBar value={done / due} tone={behind ? "late" : undefined} delay={0.1 + i * 0.03} />
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {done}/{due}
                  </span>
                </span>
              ) : (
                <span className="text-xs text-muted">None planned yet</span>
              )}
            </Td>
            {showMoney && (
              <Td label="Spent" num>
                {c.invoiced !== undefined ? (
                  formatCount(c.invoiced, "usd0")
                ) : c.contracted !== undefined ? (
                  <>
                    {formatCount(c.contracted, "usd0")} <span className="text-[10px] text-faint">Agreed</span>
                  </>
                ) : (
                  "—"
                )}
              </Td>
            )}
            <Td label="Dates" muted>
              {upper(windowLabel(c, now))}
            </Td>
            <Td act>
              {needsYou ? (
                <Link href={`/sponsor/campaigns/${encodeURIComponent(c.id)}`} aria-label={`Approve the posts waiting on ${c.name}`} className="text-xs font-semibold text-sponsor hover:underline">
                  Approve posts →
                </Link>
              ) : (
                <Link href={`/sponsor/campaigns/${encodeURIComponent(c.id)}/report`} aria-label={`See results for ${c.name}`} className="text-xs font-medium text-sponsor hover:underline">
                  See results →
                </Link>
              )}
            </Td>
          </Tr>
        );
      })}
    </PagedTable>
  );
}
