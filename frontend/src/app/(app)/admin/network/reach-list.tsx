"use client";

import { PagerRow, PendingList, ServerList } from "@/components/server-pager";
import type { PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   "How well we price reach" — SERVER-PAGED (2026-09-29). One page of GET
   /operations/delivery-health?projected=true (live campaigns that carry a
   reach projection, ending soonest first), ?page / ?size in the URL.
   -------------------------------------------------------------------------- */

export type ReachRow = {
  campaignId: string;
  campaignName: string;
  projectedImpressions: number | null;
  verifiedImpressions: number;
  underDeliveringReach: boolean;
};

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

export function ReachList({ rows, page }: { rows: ReachRow[]; page: PageInfo }) {
  return (
    <ServerList>
      <div className="space-y-3">
        <PagerRow page={page} noun="Campaigns" tone="admin" position="top" />
        <PendingList>
          <ul className="divide-y divide-line-soft rounded-xl border border-line bg-surface">
            {rows.map((h) => {
              const projected = h.projectedImpressions ?? 0;
              const ratio = projected > 0 ? h.verifiedImpressions / projected : 0;
              return (
                <li key={h.campaignId} className="px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium">{h.campaignName}</span>
                    <span className="tabular-nums text-muted">
                      {h.verifiedImpressions.toLocaleString("en-US")} verified of{" "}
                      {projected.toLocaleString("en-US")} projected ·{" "}
                      <strong className={h.underDeliveringReach ? "text-warn" : "text-text"}>{pct(ratio)}</strong>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full ${h.underDeliveringReach ? "bg-warn" : "bg-primary"}`}
                      style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </PendingList>
        <PagerRow page={page} noun="Campaigns" tone="admin" position="bottom" />
      </div>
    </ServerList>
  );
}
