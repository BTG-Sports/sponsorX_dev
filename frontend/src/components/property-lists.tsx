"use client";

import { Badge, Card } from "@/components/ui";
import { Monogram, initials } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { ListSearch, PagerRow, PendingList, ServerList } from "@/components/server-pager";
import { money } from "@/lib/fixtures";
import type { PageInfo } from "@/lib/list-query";
import type { ApiTeamAthlete, ApiTeamItem } from "@/server/property";

/* --------------------------------------------------------------------------
   The property portal's two lists, SERVER-PAGED (2026-09-29). Each is one
   page from the API with its own URL keys — roster ?page/?size/?q,
   inventory ?ipage/?isize/?iq — so paging or searching one never moves the
   other. House pager (memory: pagination-pattern), tone="property".
   -------------------------------------------------------------------------- */

const INV_KEYS = { page: "ipage", size: "isize" };

const ATHLETE_TONE: Record<string, "accent" | "primary" | "warn" | "neutral" | "danger"> = {
  ACTIVE: "accent",
  FEATURED: "primary",
  APPROVED: "primary",
  SUBMITTED: "warn",
  UNDER_REVIEW: "warn",
  CHANGES_REQUESTED: "warn",
  DRAFT: "neutral",
  SUSPENDED: "danger",
  REJECTED: "danger",
};

export function PropertyInventoryList({
  items,
  page,
  iq,
  teamName,
}: {
  items: ApiTeamItem[];
  page: PageInfo;
  iq: string;
  teamName: string;
}) {
  return (
    <ServerList>
      <div className="space-y-3">
        <ListSearch initial={iq} label="Search inventory" placeholder="Search inventory by title" tone="property" param="iq" keys={INV_KEYS} />
        {page.total === 0 ? (
          <EmptyState
            mark="chart"
            title={iq ? "No items match" : "No inventory yet"}
            hint={iq ? "Try a broader search." : "Items you or your athletes list appear here."}
          />
        ) : (
          <>
            <PagerRow page={page} noun="Items" tone="property" position="top" filtered={Boolean(iq)} keys={INV_KEYS} />
            <PendingList>
              <Card className="p-0">
                <ul className="divide-y divide-line-soft">
                  {items.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                      <Monogram text={initials(o.title)} tone="primary" className="size-8 text-[10px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{o.title}</p>
                        <p className="truncate text-[11px] text-faint">
                          {o.owner ?? teamName} · {o.kind.toLowerCase().replace(/_/g, " ")}
                          {o.quantity !== null ? ` · ${o.quantity} available` : ""}
                        </p>
                      </div>
                      <span className="text-xs font-semibold tabular-nums">{money(o.priceCents)}</span>
                      <Badge tone={o.active ? "accent" : "neutral"}>{o.active ? "Active" : "Inactive"}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </PendingList>
            <PagerRow page={page} noun="Items" tone="property" position="bottom" filtered={Boolean(iq)} keys={INV_KEYS} />
          </>
        )}
      </div>
    </ServerList>
  );
}

export function PropertyRosterList({ athletes, page, q }: { athletes: ApiTeamAthlete[]; page: PageInfo; q: string }) {
  return (
    <ServerList>
      <div className="space-y-3">
        <ListSearch initial={q} label="Search roster" placeholder="Search athletes by name" tone="property" />
        {page.total === 0 ? (
          <EmptyState
            mark="users"
            title={q ? "No athletes match" : "No roster on the platform yet"}
            hint={q ? "Try a broader search." : "Your athletes appear here once they're added and approved."}
            {...(q ? {} : { action: { label: "How athletes join", href: "/join" } })}
          />
        ) : (
          <>
            <PagerRow page={page} noun="Athletes" tone="property" position="top" filtered={Boolean(q)} />
            <PendingList>
              <Card className="p-0">
                <ul className="divide-y divide-line-soft">
                  {athletes.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <Monogram text={initials(a.displayName)} tone="neutral" shape="circle" className="size-8 text-[10px]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{a.displayName}</p>
                        <p className="truncate text-[11px] text-faint">
                          {[a.sport, a.position, a.gradYear ? `class of ${a.gradYear}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Badge tone={ATHLETE_TONE[a.state] ?? "neutral"}>{a.state.toLowerCase().replace(/_/g, " ")}</Badge>
                    </li>
                  ))}
                </ul>
              </Card>
            </PendingList>
            <PagerRow page={page} noun="Athletes" tone="property" position="bottom" filtered={Boolean(q)} />
          </>
        )}
      </div>
    </ServerList>
  );
}
