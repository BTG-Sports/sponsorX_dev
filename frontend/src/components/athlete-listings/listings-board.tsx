import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";

/* --------------------------------------------------------------------------
   POL-FE-84 — the server half of the athlete's listings: the hero shown
   while they have no listing of their own yet (the inventory's first-item
   hero, POL-FE-83, with the listing's three steps). Server component.
   -------------------------------------------------------------------------- */

const d = (s: number, extra?: CSSProperties) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

const STEPS: Array<{ icon: UiGlyph; title: string; body: string }> = [
  { icon: "tag", title: "Pick an item", body: "Anything in your Inventory with no listing yet. One listing per item." },
  { icon: "edit", title: "Say what the sponsor gets", body: "Plain words: what they get, when and where. Sponsors read this on the marketplace." },
  { icon: "bolt", title: "It goes live", body: "As soon as the checks pass. BTG only steps in when something needs a closer look, and emails you." },
];

/** No listing yet: what a listing is, the three steps, and the way in (`children`). */
export function FirstListingHero({ children, noItems }: { children: ReactNode; noItems: boolean }) {
  return (
    <section aria-label="List your first item" className="sx-iv-hero sx-arena-plate sx-arena-plate-open sx-iv-rise" style={d(0.08)}>
      <div className="sx-iv-hero-copy">
        <span className="sx-iv-hero-badge" aria-hidden="true">
          <span className="sx-iv-hero-orbit" />
          <Glyph ui="megaphone" className="size-8" />
        </span>
        <p className="sx-iv-eyebrow">Your marketplace</p>
        <h2 className="sx-iv-hero-title">Put your items where sponsors shop.</h2>
        <p className="sx-iv-hero-lede">
          A listing is how sponsors find one of your items and buy it. {noItems ? "Start by adding an item to your Inventory." : "Pick an item and say what the sponsor gets."}
        </p>
        <ol aria-label="How listing works" className="sx-iv-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="sx-iv-step sx-iv-rise" style={d(0.24 + i * 0.08)}>
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
      </div>
      <div className="sx-iv-hero-form">{children}</div>
    </section>
  );
}

/** The hero's way in when the inventory is empty: there is nothing to list yet. */
export function AddItemFirst() {
  return (
    <div className="sx-iv-start">
      <Link href="/athlete/inventory" className="sx-iv-add sx-iv-add-big">
        <span className="sx-iv-add-plus" aria-hidden="true">
          <Glyph ui="plus" className="size-5" />
        </span>
        Add an item in Inventory
      </Link>
      <p className="sx-iv-none-hint">Your Inventory is empty. Add what you&rsquo;d sell (a post, a clinic, an appearance) at your price, then come back to list it.</p>
    </div>
  );
}
