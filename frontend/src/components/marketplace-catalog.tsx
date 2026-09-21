"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { MiniChip, Monogram, initials } from "@/components/hero";
import { compact } from "@/components/charts";
import { Dropdown, FilterChip, SearchInput } from "@/components/filter-kit";
import { Pagination } from "@/components/pagination";
import { BriefRequestDrawer, type BriefSeed } from "@/components/brief-request-drawer";
import {
  INVENTORY_COPY,
  athleteInv,
  marketplacePackages,
  mediaInv,
  money,
  type InventoryState,
} from "@/lib/fixtures";

/* --------------------------------------------------------------------------
   Marketplace catalog — the sponsor marketplace's three tabs as client
   islands (2026-09-15), following the sponsor-campaigns-list idiom: instant
   search, filter dropdowns and a sort menu, active filters as dismissible
   chips, page-size + numbered pager duplicated above and below the grid, all
   synced to the URL via replaceState so a filtered view is shareable and
   survives reload. Tinted with the sponsor portal color.

   The three tabs share one generic engine (`useCatalog` + `CatalogShell`);
   only the filter/sort config and the card body differ. Filters replace the
   decorative chips the server page used to render — the eligibility fields
   from §9.4 (sport, geography, tier, budget/state) now actually narrow the
   catalogue client-side. Sponsor prices only: AthleteRate.amount never
   reaches this page (guide §04, a §30 acceptance test).
   -------------------------------------------------------------------------- */

const DEFAULT_PAGE_SIZE = 12;
const SIZE_OPTIONS = [
  { value: "12", label: "12 / page" },
  { value: "24", label: "24 / page" },
  { value: "60", label: "60 / page" },
];

const STATE_TONE: Record<InventoryState, "accent" | "warn" | "primary" | "neutral"> = {
  ACTIVE: "accent",
  LIMITED: "warn",
  BOOKED: "primary",
  SOLD_OUT: "neutral",
};

export type CatalogInitial = Partial<Record<string, string>>;

/* ------------------------------------------------------------ helpers */

/** Parse a display amount to a sortable number: "$1,500–$3,000" → 1500,
    "~$2,500" → 2500, "1.2M" → 1200000, "$15K–$30K+" → 15000. Non-numeric
    ("Recurring") → 0, so it sorts to the bottom of a low→high order. */
function parseAmount(s: string): number {
  const m = s.replace(/[,$~\s]/g, "").match(/([\d.]+)\s*([KM])?/i);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  const suf = m[2]?.toUpperCase();
  if (suf === "K") n *= 1e3;
  else if (suf === "M") n *= 1e6;
  return n;
}

const distinct = <T,>(arr: readonly T[], pick: (x: T) => string) =>
  [...new Set(arr.map(pick))];

/* -------------------------------------------------------- generic engine */

type CatalogFilter<T> = {
  key: string;
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
  match: (item: T, value: string) => boolean;
};

function useCatalog<T>({
  items,
  initial,
  demoParam,
  tab,
  search,
  filters,
  sorters,
}: {
  items: readonly T[];
  initial?: CatalogInitial;
  demoParam?: string;
  tab: string;
  search: (item: T, needle: string) => boolean;
  filters: CatalogFilter<T>[];
  sorters: Record<string, (a: T, b: T) => number>;
}) {
  const [q, setQ] = useState(initial?.q ?? "");
  const [values, setValues] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const f of filters) {
      const seeded = initial?.[f.key];
      o[f.key] = seeded && f.options.some((op) => op.value === seeded) ? seeded : "";
    }
    return o;
  });
  const [sort, setSort] = useState(() =>
    initial?.sort && sorters[initial.sort] ? initial.sort : "",
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

  /* Any filter/sort/search change resets to page one — page 4 of a set is
     meaningless once a filter narrows it to two pages. */
  const onSearch = (v: string) => {
    setQ(v);
    setPage(1);
  };
  const setFilter = (key: string) => (v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setPage(1);
  };
  const onSort = (v: string) => {
    setSort(v);
    setPage(1);
  };

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const list = items.filter((it) => {
      if (needle && !search(it, needle)) return false;
      for (const f of filters) {
        const val = values[f.key];
        if (val && !f.match(it, val)) return false;
      }
      return true;
    });
    const sorted = [...list];
    if (sort && sorters[sort]) sorted.sort(sorters[sort]);
    return sorted;
    // filters/sorters/search are module-stable configs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, needle, values, sort]);

  const filtered = Boolean(needle || filters.some((f) => values[f.key]));
  const clearAll = () => {
    setQ("");
    setValues((prev) => {
      const o: Record<string, string> = {};
      for (const k in prev) o[k] = "";
      return o;
    });
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = shown.slice((safePage - 1) * pageSize, safePage * pageSize);
  const changeSize = (v: string) => {
    setPageSize(Number(v));
    setPage(1);
  };

  /* Filters, page and size live in the URL (no navigation) so the view is
     shareable and survives reload; the active tab is preserved alongside. */
  useEffect(() => {
    const p = new URLSearchParams();
    if (demoParam) p.set("demo", demoParam);
    p.set("tab", tab);
    if (q) p.set("q", q);
    for (const f of filters) {
      if (values[f.key]) p.set(f.key, values[f.key]);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, values, sort, safePage, pageSize, demoParam, tab]);

  const rangeStart = shown.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, shown.length);

  return {
    q,
    onSearch,
    setQ,
    values,
    setFilter,
    sort,
    onSort,
    safePage,
    setPage,
    pageSize,
    changeSize,
    shown,
    paged,
    totalPages,
    filtered,
    clearAll,
    rangeStart,
    rangeEnd,
  };
}

type Ctl<T> = ReturnType<typeof useCatalog<T>>;

const SORT_LABELS = "Sort: default";

function CatalogToolbar<T>({
  ctl,
  filters,
  sortOptions,
  searchPlaceholder,
  searchLabel,
}: {
  ctl: Ctl<T>;
  filters: CatalogFilter<T>[];
  sortOptions: { value: string; label: string }[];
  searchPlaceholder: string;
  searchLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={ctl.q}
        onChange={ctl.onSearch}
        placeholder={searchPlaceholder}
        label={searchLabel}
        tone="sponsor"
      />
      {filters.map((f) => (
        <Dropdown
          key={f.key}
          label={f.label}
          allLabel={f.allLabel}
          value={ctl.values[f.key]}
          options={f.options}
          onChange={ctl.setFilter(f.key)}
          tone="sponsor"
        />
      ))}
      <div className="ml-auto">
        <Dropdown
          label="Sort results"
          allLabel={SORT_LABELS}
          value={ctl.sort}
          options={sortOptions}
          onChange={ctl.onSort}
          tone="sponsor"
        />
      </div>
    </div>
  );
}

function CatalogChips<T>({
  ctl,
  filters,
}: {
  ctl: Ctl<T>;
  filters: CatalogFilter<T>[];
}) {
  if (!ctl.filtered) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {ctl.q.trim() && (
        <FilterChip label="Clear search" onClear={() => ctl.setQ("")} tone="sponsor">
          “{ctl.q.trim()}”
        </FilterChip>
      )}
      {filters.map((f) => {
        const val = ctl.values[f.key];
        if (!val) return null;
        const label = f.options.find((o) => o.value === val)?.label ?? val;
        return (
          <FilterChip
            key={f.key}
            label={`Clear ${f.label.toLowerCase()}`}
            onClear={() => ctl.setFilter(f.key)("")}
            tone="sponsor"
          >
            {label}
          </FilterChip>
        );
      })}
      <button
        type="button"
        onClick={ctl.clearAll}
        className="text-[11px] font-medium text-muted transition-colors hover:text-text"
      >
        Clear all
      </button>
    </div>
  );
}

function CatalogPageBar<T>({
  ctl,
  noun,
  placement,
}: {
  ctl: Ctl<T>;
  noun: string;
  placement: "down" | "up";
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="mr-auto text-[11px] text-muted" aria-live="polite">
        Showing {ctl.rangeStart}–{ctl.rangeEnd} of {ctl.shown.length}
        {ctl.filtered ? " matching" : ""}
      </p>
      <Dropdown
        label={`${noun} per page`}
        allLabel={`${ctl.pageSize} / page`}
        value={String(ctl.pageSize)}
        options={SIZE_OPTIONS}
        onChange={ctl.changeSize}
        tone="sponsor"
        includeAll={false}
        placement={placement}
      />
      <Pagination
        page={ctl.safePage}
        count={ctl.totalPages}
        onChange={ctl.setPage}
        tone="sponsor"
        alwaysShow
      />
    </div>
  );
}

function CatalogShell<T>({
  ctl,
  filters,
  sortOptions,
  searchPlaceholder,
  searchLabel,
  noun,
  children,
}: {
  ctl: Ctl<T>;
  filters: CatalogFilter<T>[];
  sortOptions: { value: string; label: string }[];
  searchPlaceholder: string;
  searchLabel: string;
  noun: string;
  children: (paged: T[]) => React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <CatalogToolbar
        ctl={ctl}
        filters={filters}
        sortOptions={sortOptions}
        searchPlaceholder={searchPlaceholder}
        searchLabel={searchLabel}
      />
      <CatalogChips ctl={ctl} filters={filters} />

      {ctl.shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-5 py-12 text-center">
          <p className="text-sm font-semibold">No {noun.toLowerCase()} match</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            Nothing fits those filters. Try a broader search or clear them.
          </p>
          <button
            type="button"
            onClick={ctl.clearAll}
            className="mt-3 text-xs font-medium text-sponsor transition-colors hover:opacity-80"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <CatalogPageBar ctl={ctl} noun={noun} placement="down" />
          {children(ctl.paged)}
          <div className="pt-2">
            <CatalogPageBar ctl={ctl} noun={noun} placement="up" />
          </div>
        </>
      )}
    </div>
  );
}

/** Shared card frame: identity band on top, body below. */
function IdentityCard({
  dimmed,
  band,
  children,
}: {
  dimmed?: boolean;
  band: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className={["overflow-hidden p-0", dimmed ? "opacity-75" : ""].join(" ")}>
      <div className="flex items-center gap-3 bg-gradient-to-br from-primary/20 to-transparent p-4">
        {band}
      </div>
      {children}
    </Card>
  );
}

function cardWrap(i: number, node: React.ReactNode, key: string) {
  return (
    <div key={key} className={`min-w-0 sx-animate sx-delay-${Math.min(i + 1, 5)}`}>
      {node}
    </div>
  );
}

/* ============================================================== Packages */

type Pkg = (typeof marketplacePackages)[number];

const PKG_FILTERS: CatalogFilter<Pkg>[] = [
  {
    key: "state",
    label: "Availability",
    allLabel: "Any availability",
    options: distinct(marketplacePackages, (p) => p.state).map((s) => ({
      value: s,
      label: INVENTORY_COPY[s as InventoryState],
    })),
    match: (p, v) => p.state === v,
  },
];

const PKG_SORTS = [
  { value: "featured", label: "Featured first" },
  { value: "name", label: "Name · A–Z" },
  { value: "priceAsc", label: "Price · low to high" },
  { value: "priceDesc", label: "Price · high to low" },
];

const PKG_SORTERS: Record<string, (a: Pkg, b: Pkg) => number> = {
  featured: (a, b) =>
    Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
    a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  priceAsc: (a, b) => parseAmount(a.price) - parseAmount(b.price),
  priceDesc: (a, b) => parseAmount(b.price) - parseAmount(a.price),
};

export function PackagesCatalog({
  initial,
  demoParam,
}: {
  initial?: CatalogInitial;
  demoParam?: string;
}) {
  const [seed, setSeed] = useState<BriefSeed | null>(null);
  const ctl = useCatalog<Pkg>({
    items: marketplacePackages,
    initial,
    demoParam,
    tab: "packages",
    search: (p, n) =>
      p.name.toLowerCase().includes(n) ||
      p.note.toLowerCase().includes(n) ||
      p.includes.toLowerCase().includes(n),
    filters: PKG_FILTERS,
    sorters: PKG_SORTERS,
  });

  return (
    <>
    <CatalogShell
      ctl={ctl}
      filters={PKG_FILTERS}
      sortOptions={PKG_SORTS}
      searchPlaceholder="Search packages…"
      searchLabel="Search packages by name or contents"
      noun="Packages"
    >
      {(paged) => (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paged.map((p, i) =>
            cardWrap(
              i,
              <IdentityCard
                band={
                  <>
                    <Monogram
                      text={initials(p.name)}
                      tone={p.featured ? "accent" : "primary"}
                      className="size-10 text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold tracking-tight">
                        {p.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">{p.note}</p>
                    </div>
                    {p.featured ? (
                      <Badge tone="primary">Popular</Badge>
                    ) : (
                      <Badge tone={STATE_TONE[p.state]}>{INVENTORY_COPY[p.state]}</Badge>
                    )}
                  </>
                }
              >
                <div className="grid grid-cols-2 divide-x divide-line-soft border-y border-line-soft">
                  <div className="px-4 py-2.5">
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      {p.price}
                    </p>
                    <p className="mt-0.5 text-[10px] text-faint">price</p>
                  </div>
                  <div className="px-4 py-2.5">
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      {p.athletes}
                    </p>
                    <p className="mt-0.5 text-[10px] text-faint">athletes</p>
                  </div>
                </div>
                <div className="p-4">
                  <p className="min-h-8 text-[11px] leading-relaxed text-muted">
                    {p.includes}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setSeed({ kind: "package", name: p.name, price: p.price })
                    }
                    className="mt-3 w-full rounded-lg bg-primary py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
                  >
                    Request a brief
                  </button>
                </div>
              </IdentityCard>,
              p.id,
            ),
          )}
        </div>
      )}
    </CatalogShell>
    <BriefRequestDrawer seed={seed} onClose={() => setSeed(null)} />
    </>
  );
}

/* ===================================================== Athlete inventory */

type Ath = (typeof athleteInv)[number];

const ATH_FILTERS: CatalogFilter<Ath>[] = [
  {
    key: "sport",
    label: "Sport",
    allLabel: "All sports",
    options: distinct(athleteInv, (a) => a.sport).map((s) => ({ value: s, label: s })),
    match: (a, v) => a.sport === v,
  },
  {
    key: "tier",
    label: "Tier",
    allLabel: "All tiers",
    options: distinct(athleteInv, (a) => a.tier).map((t) => ({
      value: t,
      label: `${t} tier`,
    })),
    match: (a, v) => a.tier === v,
  },
  {
    key: "state",
    label: "Availability",
    allLabel: "Any availability",
    options: distinct(athleteInv, (a) => a.state).map((s) => ({
      value: s,
      label: INVENTORY_COPY[s as InventoryState],
    })),
    match: (a, v) => a.state === v,
  },
  {
    key: "ver",
    label: "Verification",
    allLabel: "Any source",
    options: [
      { value: "yes", label: "Verified" },
      { value: "no", label: "Self-reported" },
    ],
    match: (a, v) => (v === "yes" ? a.verified : !a.verified),
  },
];

const ATH_SORTS = [
  { value: "reach", label: "Followers · high to low" },
  { value: "engagement", label: "Engagement · high to low" },
  { value: "onTime", label: "On-time rate · high to low" },
  { value: "price", label: "Price · high to low" },
  { value: "name", label: "Name · A–Z" },
];

const ATH_SORTERS: Record<string, (a: Ath, b: Ath) => number> = {
  reach: (a, b) => b.reach - a.reach,
  engagement: (a, b) => b.engagementRate - a.engagementRate,
  onTime: (a, b) => b.onTimeRate - a.onTimeRate,
  price: (a, b) => b.sellPrice - a.sellPrice,
  name: (a, b) => a.athlete.localeCompare(b.athlete),
};

export function AthleteCatalog({
  initial,
  demoParam,
}: {
  initial?: CatalogInitial;
  demoParam?: string;
}) {
  const [seed, setSeed] = useState<BriefSeed | null>(null);
  const ctl = useCatalog<Ath>({
    items: athleteInv,
    initial,
    demoParam,
    tab: "athletes",
    search: (a, n) =>
      a.athlete.toLowerCase().includes(n) ||
      a.sport.toLowerCase().includes(n) ||
      a.geo.toLowerCase().includes(n) ||
      a.jobName.toLowerCase().includes(n) ||
      a.jobId.toLowerCase().includes(n),
    filters: ATH_FILTERS,
    sorters: ATH_SORTERS,
  });

  return (
    <>
    <CatalogShell
      ctl={ctl}
      filters={ATH_FILTERS}
      sortOptions={ATH_SORTS}
      searchPlaceholder="Search athletes…"
      searchLabel="Search athletes by name, sport, geography or job"
      noun="Athletes"
    >
      {(paged) => (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paged.map((a, i) => {
            const soldOut = a.state === "SOLD_OUT";
            return cardWrap(
              i,
              <IdentityCard
                dimmed={soldOut}
                band={
                  <>
                    <Monogram
                      text={initials(a.athlete)}
                      shape="circle"
                      tone={soldOut ? "neutral" : "primary"}
                      className="size-10 text-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold tracking-tight">
                        {a.athlete}
                        {a.verified && (
                          <span title="Verified athlete" className="text-primary-soft">
                            ✔
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">
                        {a.sport} · {a.geo}
                      </p>
                    </div>
                    {soldOut ? (
                      <Badge tone="neutral">Sold out</Badge>
                    ) : (
                      <Badge tone="primary">{a.tier} tier</Badge>
                    )}
                  </>
                }
              >
                <div className="grid grid-cols-3 divide-x divide-line-soft border-y border-line-soft">
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      {compact(a.reach)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                      followers{" "}
                      <MiniChip kind={a.verified ? "ver" : "warn"}>
                        {a.verified ? "VER" : "SELF"}
                      </MiniChip>
                    </p>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      {a.engagementRate}%
                    </p>
                    <p className="mt-0.5 text-[10px] text-faint">engagement</p>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      {a.onTimeRate}%
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                      on-time <MiniChip kind="ver">VER</MiniChip>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-4 py-3">
                  <Badge tone="neutral">{a.jobId}</Badge>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                    {a.jobName}
                  </span>
                  <span className="text-sm font-bold tabular-nums tracking-tight">
                    {money(a.sellPrice)}
                  </span>
                </div>
                <div className="flex gap-2 px-4 pb-4">
                  <Link
                    href={`/athletes/${a.slug}?from=mk-athletes`}
                    className="flex-1 rounded-lg border border-line py-2 text-center text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    disabled={soldOut}
                    title={soldOut ? "Sold out — waitlist not wired" : undefined}
                    onClick={
                      soldOut
                        ? undefined
                        : () =>
                            setSeed({
                              kind: "athlete",
                              name: a.athlete,
                              sport: a.sport,
                              jobName: a.jobName,
                              sellPrice: a.sellPrice,
                            })
                    }
                    className="flex-1 rounded-lg bg-accent py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {soldOut ? "Join waitlist" : "Add to brief"}
                  </button>
                </div>
              </IdentityCard>,
              a.id,
            );
          })}
        </div>
      )}
    </CatalogShell>
    <BriefRequestDrawer seed={seed} onClose={() => setSeed(null)} />
    </>
  );
}

/* ====================================================== Media properties */

type Media = (typeof mediaInv)[number];

const MEDIA_FILTERS: CatalogFilter<Media>[] = [
  {
    key: "state",
    label: "Availability",
    allLabel: "Any availability",
    options: distinct(mediaInv, (m) => m.state).map((s) => ({
      value: s,
      label: INVENTORY_COPY[s as InventoryState],
    })),
    match: (m, v) => m.state === v,
  },
  {
    key: "platform",
    label: "Platform",
    allLabel: "All platforms",
    options: distinct(mediaInv.flatMap((m) => m.platforms), (p) => p).map((p) => ({
      value: p,
      label: p,
    })),
    match: (m, v) => m.platforms.includes(v),
  },
];

const MEDIA_SORTS = [
  { value: "views", label: "Est. views · high to low" },
  { value: "cpm", label: "CPM · low to high" },
  { value: "priceAsc", label: "Price · low to high" },
  { value: "priceDesc", label: "Price · high to low" },
  { value: "name", label: "Name · A–Z" },
];

const MEDIA_SORTERS: Record<string, (a: Media, b: Media) => number> = {
  views: (a, b) => parseAmount(b.estViews) - parseAmount(a.estViews),
  cpm: (a, b) => a.cpm - b.cpm,
  priceAsc: (a, b) => a.price - b.price,
  priceDesc: (a, b) => b.price - a.price,
  name: (a, b) => a.name.localeCompare(b.name),
};

export function MediaCatalog({
  initial,
  demoParam,
}: {
  initial?: CatalogInitial;
  demoParam?: string;
}) {
  const ctl = useCatalog<Media>({
    items: mediaInv,
    initial,
    demoParam,
    tab: "media",
    search: (m, n) =>
      m.name.toLowerCase().includes(n) ||
      m.property.toLowerCase().includes(n) ||
      m.platforms.join(" ").toLowerCase().includes(n),
    filters: MEDIA_FILTERS,
    sorters: MEDIA_SORTERS,
  });

  return (
    <CatalogShell
      ctl={ctl}
      filters={MEDIA_FILTERS}
      sortOptions={MEDIA_SORTS}
      searchPlaceholder="Search properties…"
      searchLabel="Search media properties by name, property or platform"
      noun="Properties"
    >
      {(paged) => (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {paged.map((m, i) =>
            cardWrap(
              i,
              <IdentityCard
                band={
                  <>
                    <Monogram
                      text={initials(m.property)}
                      tone="neutral"
                      className="size-10 text-[10px]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold tracking-tight">
                        {m.name}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">{m.property}</p>
                    </div>
                    <Badge tone={STATE_TONE[m.state]}>{INVENTORY_COPY[m.state]}</Badge>
                  </>
                }
              >
                <div className="grid grid-cols-3 divide-x divide-line-soft border-y border-line-soft">
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      {m.estViews}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-faint">
                      est. views <MiniChip kind="est" />
                    </p>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      ${m.cpm}
                    </p>
                    <p className="mt-0.5 text-[10px] text-faint">CPM</p>
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-semibold tabular-nums tracking-tight">
                      {money(m.price)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-faint">price</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 px-4 pt-3">
                  {m.platforms.map((p) => (
                    <span
                      key={p}
                      className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-faint"
                    >
                      {p}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2 px-4 py-4">
                  <Link
                    href={`/properties/${m.slug ?? "btg-sports-talk"}?from=mk-media`}
                    className="flex-1 rounded-lg border border-line py-2 text-center text-[11px] font-medium text-text transition-colors hover:bg-surface-2"
                  >
                    Property
                  </Link>
                  <Link
                    href={`/sponsor/marketplace/${m.id}?from=mk-media`}
                    className="flex-1 rounded-lg bg-primary py-2 text-center text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft"
                  >
                    View Details
                  </Link>
                </div>
              </IdentityCard>,
              m.id,
            ),
          )}
        </div>
      )}
    </CatalogShell>
  );
}
