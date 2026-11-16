import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Glyph, type UiGlyph } from "./glyphs";

/* --------------------------------------------------------------------------
   POL-FE-83 — the server half of the athlete's inventory: the three-step
   "how selling works" strip under the list, and the first-item hero shown
   while the inventory is empty. Server components. (A statistics plate
   over the list was dropped for the owner's "lists first"; the tabs carry
   the counts.)
   -------------------------------------------------------------------------- */

const d = (s: number, extra?: CSSProperties) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

/* ── how selling works ─────────────────────────────────────────────────── */

const STEPS: Array<{ icon: UiGlyph; title: string; body: ReactNode }> = [
  { icon: "plus", title: "Add an item", body: "Say what you'll do (a post, a clinic, an appearance) and set your price." },
  {
    icon: "megaphone",
    title: "List it",
    body: (
      <>
        Sponsors find it once it&rsquo;s on the marketplace. With no team, list it yourself under{" "}
        <Link href="/athlete/listings" className="sx-iv-inline-link">
          Listings
        </Link>
        . On a team, your team lists it.
      </>
    ),
  },
  { icon: "bolt", title: "Keep it available", body: "Sponsors can buy it while its switch says Available. Switch it to Paused to stop sales for a while." },
];

export function HowSellingWorks({ delay = 0.18 }: { delay?: number }) {
  return (
    <ol aria-label="How selling works" className="sx-iv-steps">
      {STEPS.map((s, i) => (
        <li key={s.title} className="sx-iv-step sx-iv-rise" style={d(delay + i * 0.08)}>
          <span className="sx-iv-step-num" aria-hidden="true">
            {i + 1}
          </span>
          <span className="sx-iv-step-icon" aria-hidden="true">
            <Glyph ui={s.icon} className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="sx-iv-step-title">{s.title}</span>
            <span className="sx-iv-step-body">{s.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ── the first item ────────────────────────────────────────────────────── */

/** The empty inventory: what this page is for, the three steps, and the way in (the add button and ideas). */
export function FirstItemHero({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Add your first item" className="sx-iv-hero sx-arena-plate sx-arena-plate-open sx-iv-rise" style={d(0.08)}>
      <div className="sx-iv-hero-copy">
        <span className="sx-iv-hero-badge" aria-hidden="true">
          <span className="sx-iv-hero-orbit" />
          <Glyph ui="tag" className="size-8" />
        </span>
        <p className="sx-iv-eyebrow">Your shop window</p>
        <h2 className="sx-iv-hero-title">Sell what you do, at your price.</h2>
        <p className="sx-iv-hero-lede">
          Each item is one thing a sponsor can buy from you: a sponsored post, a clinic, an appearance, signed gear. Add your first one here.
        </p>
        <HowSellingWorks delay={0.24} />
      </div>
      <div className="sx-iv-hero-form">{children}</div>
    </section>
  );
}
