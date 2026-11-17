"use client";

/* --------------------------------------------------------------------------
   POL-FE-105 — the admin dashboard's loader for a period change. Arriving
   at /admin shows (board)/loading.tsx, a skeleton of the whole dashboard;
   but a `?days=` change on the same page re-fetches on the server without
   remounting that boundary, so the page would sit still until the new
   figures land (owner, 2026-11-17: "when fetching data, always have a
   loader" — skeleton screens, as Facebook's and Medium's).

   OpsPendingScope wraps the page and holds one transition. OpsPeriodSwitch
   navigates inside it, and while the server answers:
   - a thin bar runs across the top of the dashboard;
   - every OpsFanSlot (what the period changes: the period line, Rewards
     used, the chart, the fan journey) shows its skeleton instead of its
     figures — the card headers around them stay put;
   - a live region says "Loading the last 7 days…".
   -------------------------------------------------------------------------- */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type MouseEvent, type ReactNode } from "react";

type Pending = { pending: boolean; target: number | null; go: (href: string, days: number) => void };
const Ctx = createContext<Pending>({ pending: false, target: null, go: () => {} });

export function OpsPendingScope({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<number | null>(null);
  const go = (href: string, days: number) => {
    setTarget(days);
    start(() => router.push(href, { scroll: false }));
  };
  return (
    <Ctx.Provider value={{ pending, target, go }}>
      <div aria-busy={pending || undefined} className="relative">
        {pending && <span aria-hidden="true" className="sx-opsd-loadbar" />}
        {children}
        <p className="sr-only" aria-live="polite">
          {pending && target ? `Loading the last ${target} days…` : ""}
        </p>
      </div>
    </Ctx.Provider>
  );
}

/** Content the period changes: its figures, or `skeleton` while a new period loads. */
export function OpsFanSlot({ skeleton, children }: { skeleton: ReactNode; children: ReactNode }) {
  return useContext(Ctx).pending ? skeleton : children;
}

/** The 7 / 30 / 90 days switch. Real links (open in a new tab, work before
 *  hydration); a plain click navigates inside the scope's transition. */
export function OpsPeriodSwitch({ current, options, path, fallback }: { current: number; options: readonly number[]; path: string; fallback: number }) {
  const { pending, target, go } = useContext(Ctx);
  const href = (d: number) => (d === fallback ? path : `${path}?days=${d}`);
  const click = (e: MouseEvent<HTMLAnchorElement>, d: number) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (d === current && !pending) return;
    go(href(d), d);
  };
  /* The option being loaded reads as chosen at once. */
  const shown = pending && target ? target : current;
  return (
    <nav aria-label="Period for fan numbers" className="sx-opsd-period">
      {options.map((d) => (
        <Link
          key={d}
          href={href(d)}
          scroll={false}
          onClick={(e) => click(e, d)}
          aria-current={shown === d ? "true" : undefined}
          aria-busy={(pending && target === d) || undefined}
        >
          {d} days
        </Link>
      ))}
    </nav>
  );
}
