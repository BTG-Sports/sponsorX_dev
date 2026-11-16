import Link from "next/link";
import type { CSSProperties } from "react";

import { Glyph, type UiGlyph } from "@/components/athlete-inventory/glyphs";

/* --------------------------------------------------------------------------
   POL-FE-95 — the server half of the athlete's Sales: the hero shown while
   they have sold nothing yet (the inventory's and listings' first-run hero,
   POL-FE-83/84, with the four steps a sale takes). Server component.
   -------------------------------------------------------------------------- */

const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

const STEPS: Array<{ icon: UiGlyph; title: string; body: string }> = [
  { icon: "tag", title: "A sponsor buys", body: "They find one of your live listings on the marketplace and order it. We email you." },
  { icon: "clock", title: "They pay", body: "Nothing to do yet. Their contact details show once it's paid." },
  { icon: "box", title: "You deliver", body: "On the dates booked. Then mark it delivered, with a short note." },
  { icon: "coin", title: "They confirm, you're paid", body: "They have 24 hours; no answer counts as confirmed. Your share goes to Payouts." },
];

export function FirstSaleHero() {
  return (
    <section aria-label="Your first sale" className="sx-iv-hero sx-arena-plate sx-arena-plate-open sx-iv-rise" style={d(0.08)}>
      <div className="sx-iv-hero-copy">
        <span className="sx-iv-hero-badge" aria-hidden="true">
          <span className="sx-iv-hero-orbit" />
          <Glyph ui="coin" className="size-8" />
        </span>
        <p className="sx-iv-eyebrow">Your sales</p>
        <h2 className="sx-iv-hero-title">No sales yet. Here&rsquo;s how one goes.</h2>
        <p className="sx-iv-hero-lede">When a sponsor buys one of your items, it shows up here with what to do next, step by step.</p>
        <div className="sx-iv-start sx-sl-hero-go">
          <Link href="/athlete/listings" className="sx-iv-add sx-iv-add-big">
            <span className="sx-iv-add-plus" aria-hidden="true">
              <Glyph ui="megaphone" className="size-5" />
            </span>
            Check your listings
          </Link>
          <p className="sx-iv-none-hint">Sponsors can only buy what&rsquo;s live. A listing goes live as soon as its checks pass.</p>
        </div>
      </div>
      <ol aria-label="How a sale works" className="sx-iv-steps sx-sl-hero-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="sx-iv-step sx-iv-rise" style={d(0.24 + i * 0.09)}>
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
    </section>
  );
}
