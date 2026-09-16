"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@/components/ui";
import { MiniChip, Monogram, initials } from "@/components/hero";
import { EmptyState } from "@/components/states";
import { Dropdown, FilterChip, SearchInput } from "@/components/filter-kit";
import { Pagination } from "@/components/pagination";
import {
  INVITE_COPY,
  invitations,
  money,
  type InviteState,
} from "@/lib/fixtures";
import { isOpen, urgencyHours } from "@/lib/invitations-ui";

/* --------------------------------------------------------------------------
   InvitationsInbox — the athlete invitations list as a client island
   (2026-09-16), following the marketplace-catalog idiom: instant search,
   state tabs with live counts, a job filter and sort menu, active filters as
   dismissible chips, page-size + numbered pager duplicated above and below
   the grid, all synced to the URL via replaceState so a filtered view is
   shareable and survives reload. Tinted with the athlete portal color.

   The stat strip and demo/minor notices stay in the server page — headline
   numbers cover the whole inbox, not the current filter. Acceptance stays
   blocked (guide §08); viewing/declining are the wireable transitions.
   -------------------------------------------------------------------------- */

type Invite = (typeof invitations)[number];

export type InboxInitial = Partial<Record<string, string>>;

const DEFAULT_PAGE_SIZE = 12;
const SIZE_OPTIONS = [
  { value: "12", label: "12 / page" },
  { value: "24", label: "24 / page" },
  { value: "60", label: "60 / page" },
];

const STATE_TONE: Record<InviteState, "primary" | "accent" | "neutral" | "danger" | "warn"> = {
  INVITED: "primary",
  VIEWED: "warn",
  ACCEPTED: "accent",
  DECLINED: "neutral",
  EXPIRED: "danger",
};

const TABS = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Needs response", match: (s: InviteState) => isOpen(s) },
  { key: "accepted", label: "Accepted", match: (s: InviteState) => s === "ACCEPTED" },
  { key: "declined", label: "Declined", match: (s: InviteState) => s === "DECLINED" },
  { key: "expired", label: "Expired", match: (s: InviteState) => s === "EXPIRED" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Resolved order: open invites first (most urgent on top), then the
 *  paper trail — accepted, declined, expired. */
const STATE_ORDER: Record<InviteState, number> = {
  INVITED: 0,
  VIEWED: 0,
  ACCEPTED: 1,
  DECLINED: 2,
  EXPIRED: 3,
};

/** One row per NIL job that actually appears in the inbox. */
const JOB_OPTIONS = (() => {
  const seen = new Map<string, string>();
  for (const i of invitations) if (!seen.has(i.jobId)) seen.set(i.jobId, i.jobName);
  return [...seen].map(([value, name]) => ({ value, label: `${value} · ${name}` }));
})();

const SORT_OPTIONS = [
  { value: "expiry", label: "Expiry · soonest first" },
  { value: "offerDesc", label: "Offer · high to low" },
  { value: "offerAsc", label: "Offer · low to high" },
  { value: "sponsor", label: "Sponsor · A–Z" },
];

const SORTERS: Record<string, (a: Invite, b: Invite) => number> = {
  /* Open invites keep the front of an expiry sort — a long-resolved invite
     has nothing left to expire, whatever its fixture string parses to. */
  expiry: (a, b) =>
    Number(isOpen(b.state)) - Number(isOpen(a.state)) ||
    urgencyHours(a.expiresIn) - urgencyHours(b.expiresIn),
  offerDesc: (a, b) => b.offered - a.offered,
  offerAsc: (a, b) => a.offered - b.offered,
  sponsor: (a, b) => a.sponsor.localeCompare(b.sponsor),
};

/** Default order when no sort is chosen: urgency first. */
const urgencyFirst = (a: Invite, b: Invite) =>
  STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
  urgencyHours(a.expiresIn) - urgencyHours(b.expiresIn);

export function InvitationsInbox({
  initial,
  demoParam,
}: {
  initial?: InboxInitial;
  demoParam?: string;
}) {
  const [q, setQ] = useState(initial?.q ?? "");
  const [tab, setTab] = useState<TabKey>(() =>
    TABS.some((t) => t.key === initial?.state) ? (initial!.state as TabKey) : "all",
  );
  const [job, setJob] = useState(() =>
    JOB_OPTIONS.some((o) => o.value === initial?.job) ? initial!.job! : "",
  );
  const [sort, setSort] = useState(() =>
    initial?.sort && SORTERS[initial.sort] ? initial.sort : "",
  );
  const [page, setPage] = useState(() => {
    const n = Number(initial?.page);
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  const [pageSize, setPageSize] = useState(() =>
    SIZE_OPTIONS.some((o) => o.value === initial?.size)
      ? Number(initial!.size)
      : DEFAULT_PAGE_SIZE,
  );

  /* Any search/filter/sort change resets to page one — page 3 of a set is
     meaningless once a filter narrows it to one page. */
  const onSearch = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const onTab = (k: TabKey) => {
    setTab(k);
    setPage(1);
  };
  const onJob = (v: string) => {
    setJob(v);
    setPage(1);
  };
  const onSort = (v: string) => {
    setSort(v);
    setPage(1);
  };
  const changeSize = (v: string) => {
    setPageSize(Number(v));
    setPage(1);
  };

  /* Search across everything a person would scan the list for: sponsor,
     campaign, job name and job ID. The job filter applies before the tabs so
     tab counts answer "of what I'm looking at, how many are in each state". */
  const needle = q.trim().toLowerCase();
  const searched = useMemo(
    () =>
      invitations.filter((i) => {
        if (job && i.jobId !== job) return false;
        if (!needle) return true;
        return [i.sponsor, i.campaign, i.jobName, i.jobId]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      }),
    [needle, job],
  );

  const matcher = TABS.find((t) => t.key === tab)!.match;
  const shown = useMemo(() => {
    const list = searched.filter((i) => matcher(i.state));
    return [...list].sort(SORTERS[sort] ?? urgencyFirst);
    // matcher derives from tab; SORTERS is a module-stable config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searched, tab, sort]);

  const filtered = Boolean(needle || job);
  const clearAll = () => {
    setQ("");
    setJob("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = shown.slice((safePage - 1) * pageSize, safePage * pageSize);
  const rangeStart = shown.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, shown.length);

  /* Search, tab, filter, sort, page and size live in the URL (no navigation)
     so the view is shareable and survives reload; the demo param rides along. */
  useEffect(() => {
    const p = new URLSearchParams();
    if (demoParam) p.set("demo", demoParam);
    if (tab !== "all") p.set("state", tab);
    if (q) p.set("q", q);
    if (job) p.set("job", job);
    if (sort) p.set("sort", sort);
    if (safePage > 1) p.set("page", String(safePage));
    if (pageSize !== DEFAULT_PAGE_SIZE) p.set("size", String(pageSize));
    const qs = p.toString();
    const next = qs ? `?${qs}` : "";
    if (next !== window.location.search) {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${next}${window.location.hash}`,
      );
    }
  }, [q, tab, job, sort, safePage, pageSize, demoParam]);

  const pageBar = (placement: "down" | "up") => (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="mr-auto text-[11px] text-muted" aria-live="polite">
        Showing {rangeStart}–{rangeEnd} of {shown.length}
        {filtered ? " matching" : ""}
      </p>
      <Dropdown
        label="Invitations per page"
        allLabel={`${pageSize} / page`}
        value={String(pageSize)}
        options={SIZE_OPTIONS}
        onChange={changeSize}
        tone="athlete"
        includeAll={false}
        placement={placement}
      />
      <Pagination
        page={safePage}
        count={totalPages}
        onChange={setPage}
        tone="athlete"
        alwaysShow
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------- state tabs */}
      <div className="flex flex-wrap gap-1 self-start rounded-lg border border-line bg-surface p-1">
        {TABS.map((t) => {
          const count = searched.filter((i) => t.match(i.state)).length;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              aria-pressed={t.key === tab}
              className={[
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                t.key === tab
                  ? "bg-athlete/15 text-athlete"
                  : "text-muted hover:text-text",
              ].join(" ")}
            >
              {t.label}
              <span className="text-[10px] tabular-nums text-faint">{count}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={onSearch}
          placeholder="Search sponsor, campaign or job…"
          label="Search invitations"
          tone="athlete"
        />
        <Dropdown
          label="Filter by job"
          allLabel="All jobs"
          value={job}
          options={JOB_OPTIONS}
          onChange={onJob}
          tone="athlete"
        />
        <div className="ml-auto">
          <Dropdown
            label="Sort invitations"
            allLabel="Sort: urgency first"
            value={sort}
            options={SORT_OPTIONS}
            onChange={onSort}
            tone="athlete"
          />
        </div>
      </div>

      {/* ------------------------------------------------------------ chips */}
      {filtered && (
        <div className="flex flex-wrap items-center gap-2">
          {q.trim() && (
            <FilterChip label="Clear search" onClear={() => onSearch("")} tone="athlete">
              “{q.trim()}”
            </FilterChip>
          )}
          {job && (
            <FilterChip label="Clear job filter" onClear={() => onJob("")} tone="athlete">
              {JOB_OPTIONS.find((o) => o.value === job)?.label ?? job}
            </FilterChip>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-medium text-muted transition-colors hover:text-text"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- list */}
      {shown.length === 0 ? (
        filtered ? (
          <div className="rounded-xl border border-line bg-surface px-5 py-12 text-center">
            <p className="text-sm font-semibold">No invitations match</p>
            <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
              Try a sponsor name, a campaign, or a job ID like SX-03 — or clear
              the filters.
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="mt-3 text-xs font-medium text-athlete transition-colors hover:opacity-80"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <EmptyState
            mark="inbox"
            title="No invitations in this state"
            hint="Your rate card is what sponsors see when they browse the marketplace."
            action={{ label: "Review rate card", href: "/athlete" }}
          />
        )
      ) : (
        <>
          {pageBar("down")}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {paged.map((inv, idx) => {
              const actionable = isOpen(inv.state);
              /* Anything inside a day gets the urgency treatment, not just
                 the single most-urgent invite. */
              const urgent = actionable && urgencyHours(inv.expiresIn) <= 24;
              return (
                <div
                  key={inv.id}
                  className={`min-w-0 sx-animate sx-delay-${Math.min(idx + 1, 5)}`}
                >
                  <Card
                    className={[
                      "flex h-full flex-col overflow-hidden p-0",
                      !actionable && "opacity-80",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {/* identity band — who is asking, in what state */}
                    <div className="flex items-center gap-3 bg-gradient-to-br from-athlete/15 to-transparent p-4">
                      <Monogram
                        text={initials(inv.sponsor)}
                        tone={actionable ? "primary" : "neutral"}
                        className="size-10 text-xs"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold tracking-tight">
                          {inv.campaign}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted">
                          {inv.sponsor}
                        </p>
                      </div>
                      <Badge tone={STATE_TONE[inv.state]}>
                        {INVITE_COPY[inv.state]}
                      </Badge>
                    </div>

                    {/* the numbers a decision is made on */}
                    <div className="grid grid-cols-3 divide-x divide-line-soft border-y border-line-soft">
                      <div className="px-3 py-2.5">
                        <p className="text-sm font-semibold tabular-nums tracking-tight">
                          {money(inv.offered)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-faint">offered</p>
                      </div>
                      <div className="px-3 py-2.5">
                        <p className="text-sm font-semibold tabular-nums tracking-tight">
                          {inv.deliverableCount}
                        </p>
                        <p className="mt-0.5 text-[10px] text-faint">
                          {inv.deliverableCount === 1 ? "deliverable" : "deliverables"}
                        </p>
                      </div>
                      <div className="px-3 py-2.5">
                        <p
                          className={[
                            "text-sm font-semibold tracking-tight",
                            urgent ? "text-warn" : "tabular-nums",
                          ].join(" ")}
                        >
                          {actionable ? inv.expiresIn : "—"}
                        </p>
                        <p
                          className={`mt-0.5 text-[10px] ${urgent ? "text-warn" : "text-faint"}`}
                        >
                          {actionable ? "to respond" : inv.expiresIn}
                        </p>
                      </div>
                    </div>

                    {/* the job this invite is for */}
                    <div className="flex items-center gap-2 px-4 pt-3">
                      <Badge tone="neutral">{inv.jobId}</Badge>
                      <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                        {inv.jobName}
                      </span>
                      {urgent && <MiniChip kind="warn">URGENT</MiniChip>}
                    </div>

                    <dl className="space-y-1.5 px-4 pt-3 text-[11px]">
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-faint">Usage rights</dt>
                        <dd className="min-w-0 truncate text-muted">
                          {inv.usageRights}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="shrink-0 text-faint">Exclusivity</dt>
                        <dd className="min-w-0 truncate text-muted">
                          {inv.exclusivity ?? "None"}
                        </dd>
                      </div>
                    </dl>

                    {inv.declineReason && (
                      <p className="mx-4 mt-3 rounded-lg bg-surface-2 px-3 py-2 text-[11px] leading-relaxed text-muted">
                        {inv.declineReason}
                      </p>
                    )}

                    {/* actions pinned to the bottom so every card lines up */}
                    <div className="mt-auto space-y-2 p-4 pt-3">
                      {actionable && (
                        <div className="flex gap-2">
                          <div className="min-w-0 flex-1">
                            <Button
                              full
                              disabled
                              title="Blocked: the Campaign Order template needs counsel approval (guide §08)"
                            >
                              Review &amp; accept
                            </Button>
                          </div>
                          <Button
                            variant="secondary"
                            title="Records the decline — a wireable transition, not wired in the fixture build"
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                      <Link
                        href={`/athlete/orders/${inv.id}?from=athlete-invitations`}
                        className="block text-center text-[11px] font-medium text-muted transition-colors hover:text-text"
                      >
                        Full terms →
                      </Link>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
          <div className="pt-2">{pageBar("up")}</div>
        </>
      )}
    </div>
  );
}
