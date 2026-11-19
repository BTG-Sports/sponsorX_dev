"use client";

/* --------------------------------------------------------------------------
   record-kit — the one client piece of a BTG record page (POL-FE-108): its
   tabs. One topic on screen at a time (Overview / Details / Documents /
   History), instead of every panel stacked down the page.

   Every panel stays in the page (the inactive ones are `hidden`), so the
   server-rendered content, its forms and anything typed in them survive a
   switch. A link to something inside a panel still works: "#documents" or
   one document's own anchor (a "What's wrong" tag, BTG's emails) opens the
   tab that holds it, then scrolls to it.

   The tab bar is desk-kit's SegTabs (the sliding marker, ←/→).
   -------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { SegTabs, type SegTab } from "@/components/desk-kit";

/** A tab and the panel it opens. */
export type RecordTab = SegTab<string> & { panel: ReactNode };

export function RecordTabs({ tabs, label }: {
  tabs: RecordTab[];
  /** aria-label of the tab list, e.g. "About Westfield Hawks". */
  label: string;
}) {
  const [tab, setTab] = useState(tabs[0]?.key ?? "");
  const root = useRef<HTMLDivElement>(null);

  /* Open the tab that holds the element a hash names, then go to it. */
  const reveal = useCallback((hash: string) => {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    if (!id) return;
    const el = document.getElementById(id);
    const panel = el?.closest<HTMLElement>("[data-rec-panel]");
    if (!el || !panel || !root.current?.contains(panel)) return;
    setTab(panel.dataset.recPanel ?? "");
    /* after the panel is shown: a hidden element has nowhere to scroll to */
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => el.scrollIntoView({ block: "start" })));
  }, []);

  useEffect(() => {
    reveal(window.location.hash);
    const onHash = () => reveal(window.location.hash);
    /* the same link clicked twice changes no hash, so listen for the click too */
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>('a[href^="#"]');
      if (a) reveal(a.getAttribute("href") ?? "");
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
    };
  }, [reveal]);

  return (
    <div ref={root} className="sx-rec-tabbed">
      <div className="sx-rec-tabs">
        <SegTabs tabs={tabs.map((t) => ({ key: t.key, label: t.label, dot: t.dot, count: t.count }))} tab={tab} onPick={setTab} label={label} />
      </div>
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" aria-label={t.label} data-rec-panel={t.key} hidden={t.key !== tab} className="sx-rec-panel">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
