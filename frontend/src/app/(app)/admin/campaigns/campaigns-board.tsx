"use client";

import Link from "next/link";
import { Badge, Meter } from "@/components/ui";
import { FilterChip } from "@/components/filter-kit";
import { Monogram, initials } from "@/components/hero";
import { ListFilter, ListSearch, PagerRow, PendingList, ServerList, useListNav } from "@/components/server-pager";
import { money } from "@/lib/fixtures";
import { GROUP_LABEL, STAFFING_STATES, type CampaignGroup } from "@/lib/admin-campaign-groups";
import type { PageInfo } from "@/lib/list-query";
import type { AdminCampaign } from "@/server/admin-campaigns";

/* --------------------------------------------------------------------------
   The admin Campaigns desk, SERVER-PAGED (2026-09-29). One page of the
   tab's campaigns (?group ?q ?sort ?page ?size, all applied by the API);
   the tab counts are DB aggregates the page hands in. Staffing campaigns
   open their brief's Matching Studio, the rest their operations board.
   -------------------------------------------------------------------------- */

const STAFFING = new Set<string>(STAFFING_STATES);
const TAB_ORDER: (CampaignGroup | "")[] = ["", "attention", "delivering", "staffing", "closed"];
const SORT_OPTIONS = [
  { value: "name", label: "Name · A–Z" },
  { value: "ending", label: "Ending soonest" },
];

type Props = {
  rows: AdminCampaign[];
  page: PageInfo;
  group: CampaignGroup | "";
  counts: Record<CampaignGroup | "all", number | null>;
  q: string;
  sort: string;
};

export function CampaignsBoard(props: Props) {
  return (
    <ServerList>
      <Body {...props} />
    </ServerList>
  );
}

function Body({ rows, page, group, counts, q, sort }: Props) {
  const { set } = useListNav();
  const filtered = Boolean(q);
  /* The attention tab exists only where delivery health is readable. */
  const tabs = TAB_ORDER.filter((t) => t !== "attention" || counts.attention !== null);

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Campaign groups" className="flex flex-wrap gap-1 self-start rounded-lg border border-line bg-surface p-1">
        {tabs.map((t) => {
          const active = t === group;
          const count = counts[t || "all"];
          return (
            <button
              key={t || "all"}
              type="button"
              aria-pressed={active}
              onClick={() => set({ group: t || null })}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active ? "bg-admin/15 text-text" : "text-muted hover:text-text",
              ].join(" ")}
            >
              {GROUP_LABEL[t || "all"]}
              <span className={`text-[10px] tabular-nums ${t === "attention" && count ? "text-danger" : "text-faint"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <ListSearch initial={q} label="Search campaigns" placeholder="Search campaigns by name" tone="admin" />
        <ListFilter param="sort" value={sort} label="Sort campaigns" allLabel="Sort: newest" options={SORT_OPTIONS} tone="admin" />
      </div>

      {q && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip label="Clear search" onClear={() => set({ q: null })} tone="admin">
            “{q}”
          </FilterChip>
        </div>
      )}

      {page.total === 0 ? (
        <p className="rounded-xl border border-line bg-surface px-5 py-10 text-center text-xs text-muted">
          {q ? "No campaign in this group matches that search." : `Nothing in ${GROUP_LABEL[group || "all"].toLowerCase()} right now.`}
        </p>
      ) : (
        <>
          <PagerRow page={page} noun="Campaigns" tone="admin" position="top" filtered={filtered} />
          <PendingList>
            <ul className="grid gap-4 lg:grid-cols-2">
              {rows.map((c) => (
                <CampaignCard key={c.id} c={c} />
              ))}
            </ul>
          </PendingList>
          <PagerRow page={page} noun="Campaigns" tone="admin" position="bottom" filtered={filtered} />
        </>
      )}
    </div>
  );
}

function CampaignCard({ c }: { c: AdminCampaign }) {
  const h = c.health;
  const href = STAFFING.has(c.state)
    ? `/admin/campaigns/match${c.briefId ? `?brief=${encodeURIComponent(c.briefId)}` : ""}`
    : `/admin/campaigns/${encodeURIComponent(c.id)}`;
  const pct = c.deliverables.total ? Math.round((100 * c.deliverables.done) / c.deliverables.total) : 0;
  return (
    /* min-w-0: a long campaign name must truncate, not widen the grid track
       past a phone's width. */
    <li className="min-w-0">
      <Link
        href={href}
        className="group block rounded-xl border border-line bg-surface p-5 transition-all hover:border-admin/30 hover:bg-surface-2/40"
      >
        <div className="flex items-start gap-3">
          <Monogram text={initials(c.sponsorName)} tone="primary" className="size-10 text-[11px]" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold tracking-tight">{c.name}</h3>
              <Badge tone={c.state === "ACTIVE" ? "accent" : STAFFING.has(c.state) ? "warn" : "neutral"}>{c.state}</Badge>
              {h?.underDeliveringWork && <Badge tone="danger">{h.deliverablesOverdue} overdue</Badge>}
              {h?.underDeliveringReach && <Badge tone="warn">Reach short</Badge>}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-muted">
              Presented by {c.sponsorName} · {c.package?.name ?? "custom"}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
            <span className="text-muted">Deliverables published</span>
            <span className="font-medium tabular-nums text-text">
              {c.deliverables.done} <span className="text-faint">/ {c.deliverables.total}</span>
            </span>
          </div>
          <Meter value={pct} tone={h?.underDeliveringWork ? "primary" : "accent"} />
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
          <Stat label="Athletes" value={String(c.athletes)} />
          <Stat label="Contracted" value={typeof c.contracted === "number" ? money(c.contracted) : "—"} />
          <Stat
            label="Ends"
            value={new Date(c.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
          />
        </dl>
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}
