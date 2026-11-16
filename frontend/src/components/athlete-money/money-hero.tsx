import Link from "next/link";
import type { CSSProperties } from "react";

import { MoneyGlyph, type MoneyGlyphName } from "./money-glyphs";

/* --------------------------------------------------------------------------
   POL-FE-97 — the server half of the athlete's Payouts: the hero shown while
   no money has come in yet (the inventory's, listings' and sales' first-run
   hero, POL-FE-83/84/95), with the four steps money takes to reach them.
   -------------------------------------------------------------------------- */

const d = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

const STEPS: Array<{ icon: MoneyGlyphName; title: string; body: string }> = [
  { icon: "tag", title: "A sponsor buys and pays", body: "Your share of the price is set aside for you the moment they pay." },
  { icon: "box", title: "You deliver, they confirm", body: "They have 24 hours to confirm; no answer counts as confirmed." },
  { icon: "unlock", title: "It unlocks", body: "After a short holding period, your share is ready to cash out." },
  { icon: "bank", title: "You cash out", body: "One button sends it to your payout account on Stripe, then your bank." },
];

/** `setUp`: the payout account still needs setting up — the hint says to do it now. */
export function FirstMoneyHero({ setUp = false }: { setUp?: boolean }) {
  return (
    <section aria-labelledby="first-money-title" className="sx-iv-hero sx-arena-plate sx-arena-plate-open sx-iv-rise" style={d(0.08)}>
      <div className="sx-iv-hero-copy">
        <span className="sx-iv-hero-badge" aria-hidden="true">
          <span className="sx-iv-hero-orbit" />
          <MoneyGlyph name="wallet" className="size-8" />
        </span>
        <p className="sx-iv-eyebrow">Your money</p>
        <h2 id="first-money-title" className="sx-iv-hero-title">No money yet. Here&rsquo;s how it comes in.</h2>
        <p className="sx-iv-hero-lede">Every sale you make pays you a share. It shows up here, and you cash it out with one button once it unlocks.</p>
        <div className="sx-iv-start sx-my-hero-go">
          <Link href="/athlete/listings" className="sx-iv-add sx-iv-add-big">
            <span className="sx-iv-add-plus" aria-hidden="true">
              <MoneyGlyph name="megaphone" className="size-5" />
            </span>
            Check your listings
          </Link>
          <p className="sx-iv-none-hint">
            Sponsors can only buy what&rsquo;s live.
            {setUp && <> Set up your payout account below now, so your first payout isn&rsquo;t held up.</>}
          </p>
        </div>
      </div>
      <ol aria-label="How you get paid" className="sx-iv-steps sx-my-hero-steps">
        {STEPS.map((s, i) => (
          <li key={s.title} className="sx-iv-step sx-iv-rise" style={d(0.24 + i * 0.09)}>
            <span className="sx-iv-step-num" aria-hidden="true">
              {i + 1}
            </span>
            <span className="sx-iv-step-icon" aria-hidden="true">
              <MoneyGlyph name={s.icon} className="size-4" />
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
