import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { ArenaCount } from "@/components/arena-fx";
import { initials } from "@/components/hero";
import type { MarketStatus, Showcase } from "@/lib/inventory-showcase";
import { compact, firstName } from "@/lib/public-athlete";
import { Glyph, type UiGlyph } from "./glyphs";
import { Tilt } from "./inventory-shop";

/* --------------------------------------------------------------------------
   POL-FE-83 — one inventory item as its showcase (/athlete/inventory/[id]),
   drawn in the public athlete page's hand: a stage in the kind's colour
   with the athlete's photo pinned to it, a big title, the price, then what
   is in it, who it suits and who is selling it. Server component; the
   switch, the Edit popup and the stage's tilt are islands
   (inventory-shop.tsx). Styles: app/(app)/athlete/inventory/[id]/item.css.

   Owner-framed (memory: portal-views-stay-in-portal): a bar on top says
   this is the sponsor's view and holds the owner's controls; the sponsor's
   "buy" is never drawn as a dead button, the marketplace line says where it
   is bought instead. The last panel is the only private one.
   -------------------------------------------------------------------------- */

export type ShowcaseSeller = {
  name: string;
  roleLine: string;
  school: string | null;
  place: string | null;
  photoUrl: string | null;
  /** ACTIVE on SponsorX — the public page is live. */
  live: boolean;
  /** Followers across socials, from the public answer; null when there's none. */
  reach: { total: number; verified: boolean } | null;
  track: { campaigns: number; postsLive: number; brands: number } | null;
};

const d = (s: number, extra?: CSSProperties) => ({ "--d": `${s}s`, ...extra }) as CSSProperties;

const KIND_PITCH: Record<string, string> = {
  SOCIAL_POST: "Your brand, in front of their followers.",
  VIDEO: "Your brand, on camera.",
  APPEARANCE: "In person, at your store or event.",
  AUTOGRAPH: "Signed, for your customers.",
  CAMP: "A session with your name on it.",
  SIGNAGE: "Your logo, where people look.",
  TICKETS: "Seats for your people.",
  PACKAGE: "Several things, one price.",
  OTHER: "Something only this athlete offers.",
};

function Photo({ seller, className }: { seller: ShowcaseSeller; className: string }) {
  return (
    <span className={className}>
      {seller.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- R2 CDN image; next/image optimisation is host-specific (stay host-portable)
        <img src={seller.photoUrl} alt="" />
      ) : (
        <span aria-hidden="true">{initials(seller.name)}</span>
      )}
    </span>
  );
}

function Fact({ icon, label, value, tone }: { icon: UiGlyph; label: string; value: string; tone?: string }) {
  return (
    <div className="sx-is-fact" data-tone={tone}>
      <span className="sx-is-fact-icon" aria-hidden="true">
        <Glyph ui={icon} className="size-4" />
      </span>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function ItemShowcase({
  id,
  s,
  seller,
  market,
  sale,
  edit,
}: {
  id: string;
  s: Showcase;
  seller: ShowcaseSeller | null;
  market: MarketStatus;
  sale: ReactNode;
  edit: ReactNode;
}) {
  const first = seller ? firstName(seller.name) : null;
  const isPackage = s.kind === "PACKAGE";

  return (
    <div className="sx-iv sx-is" data-kind={s.kind} data-on={s.active ? "" : undefined} data-item={id}>
      {/* ── the owner's bar: back, what this is, the switch, Edit ── */}
      <div className="sx-is-bar sx-iv-rise" style={d(0)}>
        <Link href="/athlete/inventory" className="sx-is-back">
          <Glyph ui="back" className="size-4" />
          All items
        </Link>
        <p className="sx-is-bar-note">
          <Glyph ui="eye" className="size-4" />
          <span>
            <strong>Sponsor view.</strong> This is your item the way sponsors meet it. Only the last panel is private.
          </span>
        </p>
        <div className="sx-is-bar-actions">
          {sale}
          {edit}
        </div>
      </div>

      {/* ── the hero: the stage and the pitch ── */}
      <section className="sx-is-hero" aria-labelledby="sx-is-title">
        <Tilt className="sx-is-stage sx-iv-rise">
          <span className="sx-is-word" aria-hidden="true">
            {s.kindLabel}
          </span>
          <span className="sx-is-orbit sx-is-orbit-a" aria-hidden="true" />
          <span className="sx-is-orbit sx-is-orbit-b" aria-hidden="true" />
          <span className="sx-is-spark sx-is-spark-a" aria-hidden="true" />
          <span className="sx-is-spark sx-is-spark-b" aria-hidden="true" />
          <span className="sx-is-spark sx-is-spark-c" aria-hidden="true" />
          <span className="sx-is-glyph" aria-hidden="true">
            <Glyph kind={s.kind} className="size-full" />
          </span>
          <span className="sx-is-tag" aria-hidden="true">
            <span className="sx-arena-num">{s.price}</span>
          </span>
          {!s.active && (
            <span className="sx-is-paused" aria-hidden="true">
              Paused
            </span>
          )}
          {seller && (
            <span className="sx-is-byline">
              <Photo seller={seller} className="sx-is-avatar" />
              <span className="min-w-0">
                <span className="sx-is-byline-by">Offered by</span>
                <span className="sx-is-byline-name">
                  {seller.name}
                  {seller.live && (
                    <span className="sx-is-tick" title="Verified athlete">
                      <Glyph ui="check" className="size-3" />
                    </span>
                  )}
                </span>
              </span>
            </span>
          )}
        </Tilt>

        <div className="sx-is-pitch">
          <p className="sx-is-eyebrow sx-iv-rise" style={d(0.1)}>
            <span className="sx-is-kind-chip">
              <Glyph kind={s.kind} className="size-3.5" />
              {s.kindLabel}
            </span>
            <span>{KIND_PITCH[s.kind] ?? KIND_PITCH.OTHER}</span>
          </p>
          <h1 id="sx-is-title" className="sx-is-title sx-iv-rise" style={d(0.16)}>
            {s.title}
          </h1>
          {seller && (
            <p className="sx-is-seller sx-iv-rise" style={d(0.22)}>
              with <strong>{seller.name}</strong>
              {seller.roleLine && <span> · {seller.roleLine}</span>}
              {seller.school && <span> · {seller.school}</span>}
            </p>
          )}
          {s.description && (
            <p className="sx-is-desc sx-iv-rise" style={d(0.28)}>
              {s.description}
            </p>
          )}

          <div className="sx-is-buy sx-iv-rise" style={d(0.34)}>
            <p className="sx-is-price">
              <span className="sx-arena-num">{s.price}</span>
              <span>{isPackage ? "for the package" : "each"}</span>
            </p>
            <p className="sx-iv-stock" data-tone={s.stock.tone}>
              {s.stock.label}
            </p>
          </div>

          <dl className="sx-is-facts">
            <Fact icon="calendar" label="Available" value={s.when.label} tone={s.when.tone} />
            <Fact icon="box" label="Stock" value={s.stock.label} tone={s.stock.tone} />
            <Fact icon="bolt" label="Status" value={s.active ? "On sale" : "Paused"} tone={s.active ? "on" : "off"} />
          </dl>

          {s.rules.length > 0 && (
            <ul className="sx-is-rules" aria-label="Before ordering">
              {s.rules.map((r) => (
                <li key={r}>
                  <Glyph ui="check" className="size-3.5" />
                  {r}
                </li>
              ))}
            </ul>
          )}

          <div className="sx-is-market sx-iv-rise" data-tone={market.tone} style={d(0.46)}>
            <span className="sx-is-market-dot" aria-hidden="true" />
            <p>
              <span className="sx-is-market-label">Marketplace</span>
              {market.label}
            </p>
            {market.action && (
              <Link href={market.action.href} className="sx-is-market-go">
                {market.action.label}
                <Glyph ui="arrow" className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* ── what's in it (a package) ── */}
      {s.bundle.length > 0 && (
        <section className="sx-is-section" aria-labelledby="sx-is-in">
          <h2 id="sx-is-in" className="sx-is-h2">
            What&rsquo;s in the package
          </h2>
          <ul className="sx-is-bundle">
            {s.bundle.map((b, i) => (
              <li key={`${b.title}-${i}`} className="sx-is-bundle-item sx-iv-rise" data-kind={b.kind} style={d(0.1 + i * 0.07)}>
                <span className="sx-iv-icon sx-iv-icon-sm" aria-hidden="true">
                  <Glyph kind={b.kind} className="size-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="sx-is-bundle-title">{b.title}</span>
                  <span className="sx-is-bundle-kind">{b.kindLabel}</span>
                </span>
                <span className="sx-is-bundle-qty">×{b.quantity}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── who it suits ── */}
      <section className="sx-is-section" aria-labelledby="sx-is-fit">
        <h2 id="sx-is-fit" className="sx-is-h2">
          A good fit for
        </h2>
        {s.fits.length > 0 ? (
          <ul className="sx-is-fits">
            {s.fits.map((f, i) => (
              <li key={f} className="sx-iv-rise" style={d(0.05 + i * 0.04)}>
                {f}
              </li>
            ))}
          </ul>
        ) : (
          <p className="sx-is-empty">Any kind of brand. Pick the ones it suits best under Edit item, so the right sponsors notice it.</p>
        )}
      </section>

      {/* ── who is selling it ── */}
      {seller && (
        <section className="sx-is-section" aria-labelledby="sx-is-who">
          <h2 id="sx-is-who" className="sx-is-h2">
            Who you&rsquo;re working with
          </h2>
          <div className="sx-is-who">
            <div className="sx-is-who-id">
              <Photo seller={seller} className="sx-is-who-photo" />
              <div className="min-w-0">
                <p className="sx-is-who-name">
                  {seller.name}
                  {seller.live && <span className="sx-is-verified">Verified athlete</span>}
                </p>
                {seller.roleLine && <p className="sx-is-who-role">{seller.roleLine}</p>}
                <ul className="sx-is-who-meta">
                  {seller.school && (
                    <li>
                      <Glyph ui="school" className="size-3.5" />
                      {seller.school}
                    </li>
                  )}
                  {seller.place && (
                    <li>
                      <Glyph ui="pin" className="size-3.5" />
                      {seller.place}
                    </li>
                  )}
                </ul>
              </div>
            </div>
            {seller.reach || seller.track ? (
              <dl className="sx-is-who-stats">
                {seller.reach && (
                  <div>
                    <dt>Total reach</dt>
                    <dd>
                      <span className="sx-arena-num" title={`${seller.reach.total.toLocaleString("en-US")} followers`}>
                        {compact(seller.reach.total)}
                      </span>
                    </dd>
                    <dd className="sx-is-who-note">{seller.reach.verified ? "followers, verified" : "followers, incl. self-reported"}</dd>
                  </div>
                )}
                {seller.track && (
                  <>
                    <div>
                      <dt>Campaigns</dt>
                      <dd>
                        <ArenaCount value={seller.track.campaigns} className="sx-arena-num" />
                      </dd>
                      <dd className="sx-is-who-note">completed on SponsorX</dd>
                    </div>
                    <div>
                      <dt>Posts live</dt>
                      <dd>
                        <ArenaCount value={seller.track.postsLive} className="sx-arena-num" />
                      </dd>
                      <dd className="sx-is-who-note">sponsored</dd>
                    </div>
                  </>
                )}
              </dl>
            ) : (
              <p className="sx-is-empty">
                {seller.live
                  ? `${first}'s reach and track record show here once there are counts to show.`
                  : "Your reach and track record show here once BTG makes your profile live."}
              </p>
            )}
            <Link href="/athlete/profile" className="sx-is-who-link">
              Your public profile
              <Glyph ui="arrow" className="size-3.5" />
            </Link>
          </div>
        </section>
      )}

      {/* ── the one private panel ── */}
      <section className="sx-is-section sx-is-private" aria-labelledby="sx-is-private">
        <h2 id="sx-is-private" className="sx-is-h2">
          <Glyph ui="lock" className="size-3.5" />
          Only you see this
        </h2>
        <dl className="sx-is-private-grid">
          <div>
            <dt>Won&rsquo;t sell to</dt>
            <dd>{s.private.wontSellTo.length ? s.private.wontSellTo.join(", ") : "No categories blocked for this item"}</dd>
          </div>
          <div>
            <dt>Last changed</dt>
            <dd>
              {new Date(s.private.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} · version {s.private.version}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
