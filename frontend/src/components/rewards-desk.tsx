"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Badge, Card, Meter } from "@/components/ui";
import { compact } from "@/components/charts";
import { CloseIcon, Dropdown, FilterChip, SearchInput } from "@/components/filter-kit";
import { Pagination } from "@/components/pagination";
import {
  QrPattern,
  RewardCreator,
  type CreatedReward,
  type RewardAthlete,
  type RewardDraftIn,
  type RewardTypeOption,
} from "@/components/reward-creator";
import type { RewardState } from "@/lib/fixtures";

const DEFAULT_PAGE_SIZE = 12;
const SIZE_OPTIONS = [
  { value: "12", label: "12 / page" },
  { value: "24", label: "24 / page" },
  { value: "60", label: "60 / page" },
];

/* --------------------------------------------------------------------------
   RewardsDesk — /admin/rewards as one client island (2026-09-16). The list
   comes first: every §16 fan reward with instant search, status / type
   filters, a sort menu and the shared numbered pager (12/24/60, controls
   above and below), all synced to the URL — the applications-desk idiom.

   "Create reward" opens the RewardCreator wizard in the same near-full-screen
   modal the campaign launcher uses (portal, Escape, scroll lock, focus
   return). ?new=1 opens it on load, which is what the old /admin/rewards/new
   URL redirects into, so deep links keep working. A created reward lands at
   the top of the list as SCHEDULED — locally, with undo; nothing persists.

   The funnel strip is computed by summing the rows' RewardEvent counts, so it
   agrees with rewardFunnel on the analytics screen by construction (§22:
   every number has a source).
   -------------------------------------------------------------------------- */

export type RewardRow = {
  id: string;
  offer: string;
  sponsor: string;
  type: string;
  state: RewardState;
  expires: string;
  created: string;
  athletes: number;
  scans: number;
  claims: number;
  redeemed: number;
};

const STATE_TONE: Record<RewardState, "neutral" | "primary" | "accent" | "warn"> = {
  DRAFT: "neutral",
  SCHEDULED: "primary",
  ACTIVE: "accent",
  EXPIRED: "neutral",
  PENDING_LEGAL: "warn",
};

const STATE_LABEL: Record<RewardState, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  PENDING_LEGAL: "Pending legal",
};

const STATUS_OPTIONS = (
  ["ACTIVE", "SCHEDULED", "DRAFT", "EXPIRED", "PENDING_LEGAL"] as const
).map((s) => ({ value: s, label: STATE_LABEL[s] }));

const SORT_OPTIONS = [
  { value: "new", label: "Newest first" },
  { value: "redeemed", label: "Redemptions · high to low" },
  { value: "scans", label: "Scans · high to low" },
  { value: "rate", label: "Redemption rate · high to low" },
  { value: "offer", label: "Offer · A–Z" },
];

export function RewardsDesk({
  rows,
  copy,
  demoParam,
  initial,
  creator,
}: {
  rows: RewardRow[];
  /** REWARD_COPY — one plain-English line per state, shown on quiet rows. */
  copy: Record<RewardState, string>;
  demoParam?: string;
  initial?: Partial<
    Record<"q" | "status" | "type" | "sort" | "page" | "size" | "new", string>
  >;
  creator: {
    steps: string[];
    draft: RewardDraftIn;
    types: readonly RewardTypeOption[];
    athletes: RewardAthlete[];
  };
}) {
  const clamp = (v: string | undefined, ok: readonly string[]) =>
    v && ok.includes(v) ? v : "";

  const typeOptions = useMemo(
    () => creator.types.map((t) => ({ value: t.value, label: t.value })),
    [creator.types],
  );

  const [list, setList] = useState(rows);
  const [q, setQ] = useState(initial?.q ?? "");
  const [status, setStatus] = useState(() =>
    clamp(initial?.status, STATUS_OPTIONS.map((o) => o.value)),
  );
  const [type, setType] = useState(() =>
    clamp(initial?.type, typeOptions.map((o) => o.value)),
  );
  const [sort, setSort] = useState(() =>
    clamp(initial?.sort, SORT_OPTIONS.map((o) => o.value)),
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

  /* --- creator modal (the campaign-launcher plumbing) --- */
  const [open, setOpen] = useState(initial?.new === "1");
  const [closing, setClosing] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  /* --- created-locally toast + row highlight --- */
  const [justCreated, setJustCreated] = useState<RewardRow | null>(null);
  const seq = useRef(0);

  const requestClose = () => setClosing(true);
  const finishClose = () => {
    setClosing(false);
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setClosing(true);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!closing) return;
    const t = setTimeout(finishClose, 200);
    return () => clearTimeout(t);
  }, [closing]);

  const handleCreate = (r: CreatedReward) => {
    seq.current += 1;
    const row: RewardRow = {
      id: `rw-local-${seq.current}`,
      offer: r.offer,
      sponsor: r.sponsor,
      type: r.type,
      state: "SCHEDULED",
      expires: r.expiration,
      created: "Just now",
      athletes: r.athletes,
      scans: 0,
      claims: 0,
      redeemed: 0,
    };
    setList((prev) => [row, ...prev]);
    setJustCreated(row);
    setPage(1);
    requestClose();
  };

  const undoCreate = () => {
    if (!justCreated) return;
    setList((prev) => prev.filter((x) => x.id !== justCreated.id));
    setJustCreated(null);
  };

  /* Any filter/sort change resets to the first page. */
  const onFilter =
    (set: (v: string) => void) =>
    (v: string) => {
      set(v);
      setPage(1);
    };

  const needle = q.trim().toLowerCase();
  const shown = useMemo(() => {
    const filtered = list.filter((r) => {
      const qOk =
        !needle ||
        r.offer.toLowerCase().includes(needle) ||
        r.sponsor.toLowerCase().includes(needle);
      const statusOk = !status || r.state === status;
      const typeOk = !type || r.type === type;
      return qOk && statusOk && typeOk;
    });
    const rate = (r: RewardRow) => (r.claims > 0 ? r.redeemed / r.claims : -1);
    const stamp = (r: RewardRow) =>
      r.created === "Just now" ? Infinity : Date.parse(r.created) || 0;
    const sorted = [...filtered];
    switch (sort) {
      case "new":
        sorted.sort((a, b) => stamp(b) - stamp(a));
        break;
      case "redeemed":
        sorted.sort((a, b) => b.redeemed - a.redeemed);
        break;
      case "scans":
        sorted.sort((a, b) => b.scans - a.scans);
        break;
      case "rate":
        sorted.sort((a, b) => rate(b) - rate(a));
        break;
      case "offer":
        sorted.sort((a, b) => a.offer.localeCompare(b.offer));
        break;
    }
    return sorted;
  }, [list, needle, status, type, sort]);

  const filtered = Boolean(needle || status || type);
  const clearAll = () => {
    setQ("");
    setStatus("");
    setType("");
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const paged = shown.slice((safePage - 1) * pageSize, safePage * pageSize);

  const changeSize = (v: string) => {
    setPageSize(Number(v));
    setPage(1);
  };

  /* Filters, page and size live in the URL (no navigation) so a view is
     shareable and survives reload; ?new never gets written back, so the
     redirect-opened modal leaves a clean URL behind. */
  useEffect(() => {
    const p = new URLSearchParams();
    if (demoParam) p.set("demo", demoParam);
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (type) p.set("type", type);
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
  }, [q, status, type, sort, safePage, pageSize, demoParam]);

  /* Funnel strip — summed from the rows' RewardEvent counts (§16, §22). */
  const totals = useMemo(
    () =>
      list.reduce(
        (t, r) => ({
          active: t.active + (r.state === "ACTIVE" ? 1 : 0),
          scans: t.scans + r.scans,
          claims: t.claims + r.claims,
          redeemed: t.redeemed + r.redeemed,
        }),
        { active: 0, scans: 0, claims: 0, redeemed: 0 },
      ),
    [list],
  );

  const rangeStart = shown.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, shown.length);

  const pagerBar = (placement?: "up") => (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <p className="mr-auto text-[11px] text-muted" aria-live="polite">
        Showing {rangeStart}–{rangeEnd} of {shown.length}
        {filtered ? " matching" : ""}
      </p>
      <Dropdown
        label="Rewards per page"
        allLabel={`${pageSize} / page`}
        value={String(pageSize)}
        options={SIZE_OPTIONS}
        onChange={changeSize}
        tone="admin"
        includeAll={false}
        placement={placement}
      />
      <Pagination
        page={safePage}
        count={totalPages}
        onChange={setPage}
        tone="admin"
        alwaysShow
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* ------------------------------------------------------ funnel strip */}
      <Card className="p-0">
        <div className="grid grid-cols-2 divide-line-soft sm:grid-cols-4 sm:divide-x">
          <FunnelStat label="Active rewards" value={String(totals.active)} />
          <FunnelStat label="QR scans" value={totals.scans.toLocaleString("en-US")} />
          <FunnelStat label="Claims" value={totals.claims.toLocaleString("en-US")} />
          <FunnelStat label="Redeemed" value={totals.redeemed.toLocaleString("en-US")} />
        </div>
        <p className="border-t border-line-soft px-4 py-2 text-[10px] text-faint">
          Summed from RewardEvent — scan, landing, claim and redeem are four
          separate events (§16).{" "}
          <Link
            href="/admin/analytics"
            className="font-medium text-accent transition-colors hover:text-accent-soft"
          >
            Full analytics →
          </Link>
        </p>
      </Card>

      {/* ---------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={q}
          onChange={onFilter(setQ)}
          placeholder="Search offer or sponsor…"
          label="Search rewards by offer or sponsor"
          tone="admin"
        />
        <Dropdown
          label="Filter by status"
          allLabel="All statuses"
          value={status}
          options={STATUS_OPTIONS}
          onChange={onFilter(setStatus)}
          tone="admin"
        />
        <Dropdown
          label="Filter by redemption type"
          allLabel="All types"
          value={type}
          options={typeOptions}
          onChange={onFilter(setType)}
          tone="admin"
        />
        <div className="ml-auto flex items-center gap-2">
          <Dropdown
            label="Sort rewards"
            allLabel="Sort: default"
            value={sort}
            options={SORT_OPTIONS}
            onChange={onFilter(setSort)}
            tone="admin"
          />
          <button
            ref={triggerRef}
            type="button"
            onClick={() => {
              setClosing(false);
              setOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[11px] font-medium text-cta-ink transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <span aria-hidden="true" className="text-sm leading-none">
              +
            </span>
            Create reward
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------- active chips */}
      {filtered && (
        <div className="flex flex-wrap items-center gap-2">
          {needle && (
            <FilterChip label="Clear search" onClear={() => setQ("")} tone="admin">
              “{q}”
            </FilterChip>
          )}
          {status && (
            <FilterChip
              label="Clear status filter"
              onClear={() => setStatus("")}
              tone="admin"
            >
              {STATE_LABEL[status as RewardState]}
            </FilterChip>
          )}
          {type && (
            <FilterChip label="Clear type filter" onClear={() => setType("")} tone="admin">
              {type}
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

      {/* -------------------------------------------------- created toast */}
      {justCreated && (
        <div className="sx-pop flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/8 px-4 py-3">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/20 text-accent"
            aria-hidden="true"
          >
            ✓
          </span>
          <p className="min-w-0 flex-1 text-xs text-text">
            <span className="font-semibold">{justCreated.offer}</span> created as{" "}
            <span className="font-medium">Scheduled</span> — tokens generate for{" "}
            {justCreated.athletes} athlete{justCreated.athletes === 1 ? "" : "s"} at
            launch. Demo only; nothing was saved.
          </p>
          <button
            type="button"
            onClick={undoCreate}
            className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-text"
          >
            Undo
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------- list */}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-5 py-12 text-center">
          <p className="text-sm font-semibold">
            {filtered ? "No rewards match" : "No fan rewards yet"}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
            {filtered
              ? "Nothing fits those filters. Try a broader search or clear them."
              : "Rewards are what fans scan at events — create the first one and every athlete gets their own token (§16)."}
          </p>
          {filtered ? (
            <button
              type="button"
              onClick={clearAll}
              className="mt-3 text-xs font-medium text-accent transition-colors hover:text-accent-soft"
            >
              Clear filters
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setClosing(false);
                setOpen(true);
              }}
              className="mt-3 text-xs font-medium text-accent transition-colors hover:text-accent-soft"
            >
              Create a reward →
            </button>
          )}
        </div>
      ) : (
        <>
          {pagerBar()}
          <ul className="grid gap-4 lg:grid-cols-2">
            {paged.map((r) => {
              const quiet = r.scans === 0;
              const isNew = r.id === justCreated?.id;
              return (
                <li key={r.id}>
                  <div
                    className={[
                      "rounded-xl border bg-surface p-4 transition-all",
                      isNew
                        ? "sx-pop border-primary/50 shadow-sm"
                        : "border-line hover:border-primary/30",
                    ].join(" ")}
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={[
                          "shrink-0 rounded-lg border border-line p-1",
                          r.state === "ACTIVE" ? "" : "opacity-50 grayscale",
                        ].join(" ")}
                      >
                        <QrPattern
                          seed={`${r.sponsor}·${r.offer.toUpperCase()}·${r.type}`}
                          className="size-14"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="truncate text-sm font-semibold tracking-tight">
                            {r.offer}
                          </h2>
                          <Badge tone={STATE_TONE[r.state]}>
                            {STATE_LABEL[r.state]}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted">
                          {r.sponsor} · {r.type}
                        </p>
                        <p className="mt-0.5 text-[10px] text-faint">
                          {r.athletes > 0
                            ? `${r.athletes} athlete token${r.athletes === 1 ? "" : "s"}`
                            : "No tokens yet"}
                          {" · "}
                          {r.expires === "—" ? "no expiry set" : `expires ${r.expires}`}
                        </p>
                      </div>
                    </div>

                    {quiet ? (
                      <p className="mt-3.5 border-t border-line-soft pt-3 text-[10px] leading-relaxed text-faint">
                        {copy[r.state]}
                      </p>
                    ) : (
                      <div className="mt-3.5 border-t border-line-soft pt-3">
                        <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
                          <span className="text-muted">
                            <span className="font-medium tabular-nums text-text">
                              {compact(r.scans)}
                            </span>{" "}
                            scans →{" "}
                            <span className="font-medium tabular-nums text-text">
                              {compact(r.claims)}
                            </span>{" "}
                            claims →{" "}
                            <span className="font-medium tabular-nums text-text">
                              {compact(r.redeemed)}
                            </span>{" "}
                            redeemed
                          </span>
                          <span className="font-medium tabular-nums text-text">
                            {r.claims > 0
                              ? `${Math.round((r.redeemed / r.claims) * 100)}%`
                              : "—"}
                          </span>
                        </div>
                        <Meter
                          value={r.claims > 0 ? (r.redeemed / r.claims) * 100 : 0}
                          tone={r.state === "ACTIVE" ? "accent" : "primary"}
                        />
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {pagerBar("up")}
        </>
      )}

      {/* --------------------------------------------------- creator modal */}
      {open &&
        createPortal(
          <div
            className={["fixed inset-0 z-50", closing ? "pointer-events-none" : ""].join(" ")}
            role="dialog"
            aria-modal="true"
            aria-label="Create fan reward"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={requestClose}
              className={[
                closing ? "sx-backdrop-out" : "sx-backdrop",
                "absolute inset-0 cursor-default bg-black/55",
              ].join(" ")}
            />

            <div className="absolute inset-0 flex items-stretch justify-center sm:items-center sm:p-4">
              <div
                className={[
                  "relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden bg-bg shadow-2xl transition-all duration-200 sm:max-h-[92vh] sm:rounded-2xl sm:border sm:border-line",
                  closing ? "scale-[0.98] opacity-0" : "sx-pop",
                ].join(" ")}
              >
                {/* header — pinned */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line-soft bg-surface px-5 py-3.5">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold tracking-tight">
                      Create Fan Reward
                    </h2>
                    <p className="truncate text-[11px] text-muted">
                      §16 · one reward, one token per athlete · scan → claim →
                      redeem
                    </p>
                  </div>
                  <button
                    ref={closeBtnRef}
                    type="button"
                    onClick={requestClose}
                    aria-label="Close"
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-muted transition-colors hover:bg-surface-2 hover:text-text"
                  >
                    <CloseIcon />
                  </button>
                </div>

                {/* scroll body — fresh wizard each open (clean slate) */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                  <RewardCreator
                    steps={creator.steps}
                    draft={creator.draft}
                    types={creator.types}
                    athletes={creator.athletes}
                    onCancel={requestClose}
                    onCreate={handleCreate}
                  />
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function FunnelStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-faint">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>
    </div>
  );
}
