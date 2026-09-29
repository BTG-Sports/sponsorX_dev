"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dropdown, SearchInput, type FilterTone } from "@/components/filter-kit";
import { Pagination } from "@/components/pagination";
import { DEFAULT_KEYS, SIZE_OPTIONS, nextQuery, rangeOf, type ListKeys, type PageInfo } from "@/lib/list-query";

/* --------------------------------------------------------------------------
   Server-paged list controls (2026-09-29) — the house pager (memory:
   pagination-pattern) driving the SERVER instead of slicing in the browser.

   Every control writes the URL (router.replace, no scroll jump) inside a
   transition, the server page re-reads it and asks the API for exactly that
   page. Instant and app-like: no Apply button, search debounced, the list
   dims while the next page loads. Filters / search / sort / size reset to
   page 1; `?page`/`?size` drop out at their defaults.

   <ServerList> provides the navigation + pending state; <PagerRow> is the
   duplicated control row (range text in the TOP row only; the bottom row's
   size menu opens upward); <ListSearch> / <ListFilter> are the instant
   filter controls; <PendingList> dims its children while loading.
   -------------------------------------------------------------------------- */

type Nav = { set: (patch: Record<string, string | number | null>, keys?: ListKeys) => void; pending: boolean };
const NavCtx = createContext<Nav | null>(null);

export function useListNav(): Nav {
  const ctx = useContext(NavCtx);
  if (!ctx) throw new Error("useListNav needs <ServerList>.");
  return ctx;
}

export function ServerList({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (patch: Record<string, string | number | null>, keys: ListKeys = DEFAULT_KEYS) =>
    start(() => router.replace(`${pathname}${nextQuery(sp.toString(), patch, keys)}`, { scroll: false }));
  return <NavCtx.Provider value={{ set, pending }}>{children}</NavCtx.Provider>;
}

export function PendingList({ children, className = "" }: { children: ReactNode; className?: string }) {
  const { pending } = useListNav();
  return (
    <div aria-busy={pending} className={`transition-opacity ${pending ? "opacity-60" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function PagerRow({
  page,
  noun,
  tone,
  position,
  filtered = false,
  keys = DEFAULT_KEYS,
}: {
  page: PageInfo;
  /** URL keys for this list's page and size (a second list on the page). */
  keys?: ListKeys;
  /** "Campaigns" → "Campaigns per page". */
  noun: string;
  tone: FilterTone;
  position: "top" | "bottom";
  /** Say "matching" when a filter or search narrowed the list. */
  filtered?: boolean;
}) {
  const { set } = useListNav();
  const { start, end } = rangeOf(page);
  const showRange = position === "top" && (filtered || page.pages > 1);
  return (
    <div className={`flex flex-wrap items-center justify-end gap-3 ${position === "bottom" ? "pt-2" : ""}`}>
      {position === "top" && (
        <p className="mr-auto text-[11px] text-muted" aria-live="polite">
          {showRange ? `Showing ${start}–${end} of ${page.total}${filtered ? " matching" : ""}` : ""}
        </p>
      )}
      <Dropdown
        label={`${noun} per page`}
        allLabel={`${page.size} / page`}
        value={String(page.size)}
        options={SIZE_OPTIONS}
        onChange={(v) => set({ [keys.size]: v }, keys)}
        tone={tone}
        includeAll={false}
        {...(position === "bottom" ? { placement: "up" as const } : {})}
      />
      <Pagination page={page.page} count={page.pages} onChange={(p) => set({ [keys.page]: p }, keys)} tone={tone} alwaysShow />
    </div>
  );
}

/** Debounced (300ms) search box bound to ?q. */
export function ListSearch({
  initial,
  label,
  placeholder,
  tone,
  param = "q",
  keys = DEFAULT_KEYS,
}: {
  initial: string;
  label: string;
  placeholder: string;
  tone: FilterTone;
  /** URL key for the search (a second list's own, e.g. "iq"). */
  param?: string;
  /** Which list's page a new search resets. */
  keys?: ListKeys;
}) {
  const { set } = useListNav();
  const [q, setQ] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [sent, setSent] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  /* The URL's ?q changed. If it's our own debounced echo, keep what the user
     is still typing; if something else changed it (a "Clear" chip, back /
     forward), follow it. Adjusting state during render, not in an effect. */
  if (initial !== seen) {
    setSeen(initial);
    if (initial !== sent) {
      setSent(initial);
      setQ(initial);
    }
  }
  const change = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSent(v.trim());
      set({ [param]: v.trim() || null }, keys);
    }, 300);
  };
  return <SearchInput value={q} onChange={change} label={label} placeholder={placeholder} tone={tone} />;
}

/** An instant dropdown filter bound to one URL key. */
export function ListFilter({
  param,
  value,
  label,
  allLabel,
  options,
  tone,
  keys = DEFAULT_KEYS,
}: {
  /** Which list's page a change resets. */
  keys?: ListKeys;
  param: string;
  value: string;
  label: string;
  allLabel: string;
  options: { value: string; label: string }[];
  tone: FilterTone;
}) {
  const { set } = useListNav();
  return <Dropdown label={label} allLabel={allLabel} value={value} options={options} onChange={(v) => set({ [param]: v || null }, keys)} tone={tone} />;
}
