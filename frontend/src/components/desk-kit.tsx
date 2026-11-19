"use client";

/* --------------------------------------------------------------------------
   desk-kit — what the admin desks share since the Inventory-style redraws
   (POL-FE-106 /admin/applications, POL-FE-109 /admin/new-signups). Lifted out
   of applications-desk.tsx so a second desk doesn't carry a copy, or pull
   the whole review drawer into its bundle. Styles: `.sx-ap-*` in
   admin/applications/(queue)/applications.css, which each desk's page imports.

   - rise            the entrance delay (`--d`) for `.sx-ap-rise`.
   - useDeskView     List (the default) or Cards, remembered per browser
     ViewToggle      under the desk's own key.
   - SegTabs         a segmented tab bar with a sliding marker; ←/→ move. A
                     tab may carry a dot (something is waiting behind it).
   - StatusPill      a status in a pill; `act` pulses its dot: your move.
   - useLoaderShown  a pending flag held at least half a second, so a fast
                     answer reads as "loaded" instead of a flicker.
   - LoadSwap        children, or — while the surrounding <ServerList> is
                     fetching — a running bar, a "Loading …" line and the
                     skeleton passed in.
   - PagerGhost      the top pager's stand-in while loading.
   - HowItWorks      a header button that opens the desk's steps in a panel,
                     with a key to reading the list under them.
   -------------------------------------------------------------------------- */

import { useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";
import { useListNav } from "@/components/server-pager";

export const rise = (seconds: number, extra?: CSSProperties) => ({ "--d": `${seconds}s`, ...extra }) as CSSProperties;

/* ------------------------------------------------------------ List ↔ Cards */

export type DeskLayout = "list" | "cards";

const viewSubs = new Set<() => void>();
function readView(key: string): DeskLayout {
  try {
    return window.localStorage.getItem(key) === "cards" ? "cards" : "list";
  } catch {
    return "list";
  }
}
function writeView(key: string, v: DeskLayout) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* private window: the choice lasts until the page reloads */
  }
  viewSubs.forEach((f) => f());
}
function subscribeView(cb: () => void) {
  viewSubs.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    viewSubs.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** The desk's layout, from localStorage under `key` ("list" on the server). */
export function useDeskView(key: string): DeskLayout {
  return useSyncExternalStore(subscribeView, () => readView(key), () => "list" as DeskLayout);
}

export function ViewToggle({ view, storageKey }: { view: DeskLayout; storageKey: string }) {
  return (
    <div role="group" aria-label="Show as" className="sx-ap-views">
      {(["list", "cards"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => writeView(storageKey, v)} className="sx-ap-view">
          <Glyph ui={v === "cards" ? "grid" : "rows"} className="size-4" />
          <span>{v === "cards" ? "Cards" : "List"}</span>
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- tabs */

export type SegTab<K extends string> = {
  key: K;
  label: string;
  /** something waits behind this tab */
  dot?: boolean;
  /** how many things the tab holds (a record page's "Documents 2"); a desk's filter tabs leave it out */
  count?: number;
};

/** A segmented bar with a sliding marker (the Inventory's tabs). ←/→ move
 *  between them. On a desk, no counts: its status cards carry those. */
export function SegTabs<K extends string>({
  tabs,
  tab,
  onPick,
  label,
  busy = false,
}: {
  tabs: readonly SegTab<K>[];
  tab: K;
  onPick: (key: K) => void;
  /** aria-label of the tab list, e.g. "Show applications". */
  label: string;
  /** A spinner on the selected tab while its list loads. */
  busy?: boolean;
}) {
  const [current, setCurrent] = useState(tab);
  const [seen, setSeen] = useState(tab);
  if (tab !== seen) {
    setSeen(tab);
    setCurrent(tab);
  }
  const bar = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const place = () => {
      const btn = bar.current?.querySelector<HTMLElement>(`[data-tab="${current}"]`);
      const m = marker.current;
      if (!btn || !m) return;
      m.style.setProperty("--x", `${btn.offsetLeft}px`);
      m.style.setProperty("--w", `${btn.offsetWidth}px`);
      m.dataset.ready = "";
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [current, busy]);
  const go = (k: K) => {
    if (k === current) return;
    setCurrent(k);
    onPick(k);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const i = tabs.findIndex((t) => t.key === current);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    go(next.key);
    bar.current?.querySelector<HTMLElement>(`[data-tab="${next.key}"]`)?.focus();
  };
  return (
    <div ref={bar} role="tablist" aria-label={label} className="sx-ap-tabs" onKeyDown={onKey}>
      <span ref={marker} aria-hidden="true" className="sx-ap-tab-marker" />
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          data-tab={t.key}
          aria-selected={t.key === current}
          tabIndex={t.key === current ? 0 : -1}
          onClick={() => go(t.key)}
          className="sx-ap-tab"
          data-busy={busy && t.key === current ? "" : undefined}
        >
          {busy && t.key === current ? (
            <span className="sx-ap-spin sx-ap-spin-sm" aria-hidden="true" />
          ) : (
            t.dot && <span className="sx-ap-tab-dot" aria-hidden="true" />
          )}
          {t.label}
          {t.count !== undefined && <span className="sx-ap-tab-n">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------- pill */

export function StatusPill({ tone, act, children }: { tone: string; act: boolean; children: ReactNode }) {
  return (
    <span className="sx-ap-pill" data-tone={tone} data-act={act ? "" : undefined}>
      <span className="sx-ap-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- loaders */

/** How long a loader stays up at least, so a fast answer reads as "loaded"
 *  rather than a flicker (owner, 2026-11-17: "add a loader too"). */
const MIN_LOADER_MS = 500;

/** A pending flag, held for at least MIN_LOADER_MS. */
export function useLoaderShown(pending: boolean): boolean {
  const [prev, setPrev] = useState(pending);
  const [hold, setHold] = useState(false);
  const started = useRef(0);
  /* adjusting state during render, not in an effect (the house pattern) */
  if (pending !== prev) {
    setPrev(pending);
    if (!pending) setHold(true);
  }
  useEffect(() => {
    if (pending) started.current = performance.now();
  }, [pending]);
  useEffect(() => {
    if (!hold) return;
    const left = Math.max(0, MIN_LOADER_MS - (performance.now() - started.current));
    const t = window.setTimeout(() => setHold(false), left);
    return () => window.clearTimeout(t);
  }, [hold]);
  return pending || hold;
}

/** The loading face of a list: a running bar, a spoken "Loading …" line with
 *  a spinner, then the skeleton in the list's own shape. */
export function ListLoading({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div aria-busy="true" className="sx-ap-wait-load">
      <span className="sx-ap-loadbar" aria-hidden="true" />
      <p role="status" className="sx-ap-loading">
        <span className="sx-ap-spin" aria-hidden="true" />
        {label}
      </p>
      {children}
    </div>
  );
}

/** Children, or the loading face while the surrounding <ServerList> fetches.
 *  For a server-rendered list: pass its skeleton as a node. */
export function LoadSwap({ label, skeleton, children }: { label: string; skeleton: ReactNode; children: ReactNode }) {
  const loading = useLoaderShown(useListNav().pending);
  return loading ? <ListLoading label={label}>{skeleton}</ListLoading> : <>{children}</>;
}

/** The top pager's stand-in while loading: the old "Showing 1–12 of 23"
 *  would be wrong for the list on its way. */
export function PagerGhost() {
  return (
    <div aria-hidden="true" className="flex items-center justify-between gap-3">
      <span className="sx-ops-ghost block h-3.5 w-36 rounded" />
      <span className="flex items-center gap-2">
        <span className="sx-ops-ghost block h-9 w-24 rounded-md" />
        <span className="sx-ops-ghost block h-9 w-28 rounded-md" />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ how it works */

export type FlowStep = { icon: UiGlyph; title: string; text: string };

/** "How it works": a header button that opens the desk's flow in a panel
 *  (owner, 2026-11-17: "make a button for how this works and put this on the
 *  panel"), with a key to reading the list — the `<li>`s passed as children.
 *  Escape, the scrim, Close and "Got it" close it; focus stays inside while
 *  open and returns to the button after. Portaled to <body> so no entrance
 *  transform traps it. */
export function HowItWorks({
  lede,
  steps,
  keyTitle = "Reading the list",
  children,
}: {
  lede: string;
  steps: readonly FlowStep[];
  keyTitle?: string;
  children?: ReactNode;
}) {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const opener = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const titleId = useId();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const shut = () => {
    setPhase("closed");
    opener.current?.focus();
  };
  const close = () => {
    if (phase !== "open") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) shut();
    else {
      setPhase("closing");
      timer.current = window.setTimeout(shut, 260);
    }
  };

  useEffect(() => {
    if (phase !== "open") return;
    const root = document.documentElement;
    const was = root.style.overflow;
    root.style.overflow = "hidden";
    const t = window.setTimeout(() => sheet.current?.querySelector<HTMLElement>(".sx-ap-close")?.focus(), 60);
    return () => {
      root.style.overflow = was;
      window.clearTimeout(t);
    };
  }, [phase]);

  const onKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab" || !sheet.current) return;
    const f = sheet.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href]");
    if (f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button ref={opener} type="button" onClick={() => setPhase("open")} aria-haspopup="dialog" className="sx-ap-help">
        <span className="sx-ap-help-q" aria-hidden="true">?</span>
        How it works
      </button>
      {phase !== "closed" &&
        createPortal(
          <div className="sx-ops sx-ap-modal" data-closing={phase === "closing" ? "" : undefined}>
            <div className="sx-ap-scrim" onClick={close} aria-hidden="true" />
            <section ref={sheet} role="dialog" aria-modal="true" aria-labelledby={titleId} className="sx-ap-sheet" onKeyDown={onKey}>
              <i aria-hidden="true" className="sx-ops-br sx-ops-br-a" />
              <i aria-hidden="true" className="sx-ops-br sx-ops-br-b" />
              <span aria-hidden="true" className="sx-ap-sheet-scan" />
              <div className="sx-ap-sheet-head">
                <span className="sx-ap-sheet-badge" aria-hidden="true">
                  <Glyph ui="bolt" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="sx-ap-sheet-title">How it works</h2>
                  <p className="sx-ap-sheet-lede">{lede}</p>
                </div>
                <button type="button" onClick={close} className="sx-ap-close" aria-label="Close">
                  <Glyph ui="close" className="size-4" />
                </button>
              </div>

              <div className="sx-ap-sheet-body">
                <ol className="sx-ap-flow-steps">
                  <span aria-hidden="true" className="sx-ap-flow-rail" />
                  {steps.map((s, i) => (
                    <li key={s.title} className="sx-ap-flow-step" style={rise(0.12 + i * 0.09)}>
                      <span className="sx-ap-flow-dot" aria-hidden="true">
                        <Glyph ui={s.icon} className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="sx-ap-flow-title">
                          <span className="sx-ap-flow-n">{i + 1}</span>
                          {s.title}
                        </span>
                        <span className="sx-ap-flow-text">{s.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>

                {children && (
                  <div className="sx-ap-key" style={rise(0.12 + steps.length * 0.09)}>
                    <p className="sx-ap-key-k">{keyTitle}</p>
                    <ul>{children}</ul>
                  </div>
                )}
              </div>

              <div className="sx-ap-sheet-foot">
                <button type="button" onClick={close} className="sx-ap-got">
                  Got it
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}
