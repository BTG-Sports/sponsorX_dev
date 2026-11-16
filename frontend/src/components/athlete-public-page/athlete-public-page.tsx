import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { SourceLabel } from "@/components/ui";
import { initials } from "@/components/hero";
import { CountUp } from "@/components/count-up";
import { categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import { capabilityLabel } from "@/lib/content-capabilities";
import {
  compact, earnedBadges, firstName, monthLabel, onTimePercent, platformName, plural, reach, storyLine, words,
  type BadgeTone, type PublicAthlete,
} from "@/lib/public-athlete";
import { ProfileFx } from "./profile-fx";
import { ShareProfile } from "./share-profile";
import "./athlete-public-page.css";

/* --------------------------------------------------------------------------
   P3-FE-08 → POL-FE-82 — an ACTIVE athlete's public page, from
   GET /public/athletes/:slug.

   POL-FE-82 (programme owner, 2026-11-16): a big visual redesign after three
   profile references (cover + overlapping photo + big stats + sticker
   badges + tabs + work cards). "Easy to understand": the page reads top to
   bottom as three plain questions, each a tab:

     1. Track record: what have they done on SponsorX?
     2. Reach: who will see it?
     3. About: who are they?

   and one action, "Request a proposal" (Phase 1 is managed: BTG matches,
   checks conflicts and prices, never a checkout).

   Still exactly the §11 PUBLIC sections plus the counts the API sends: no
   legal name, contact, age, rates or restrictions, no sponsor or campaign
   names. Minors look the same as adults; a minor's photo only appears once
   BTG approved it (the API decides). Every number says where it came from.

   TWO MODES, ONE PAGE (owner, 2026-11-16: the finished /athlete/profile
   shows this page). `public` is /athletes/[slug]. `owner` is the athlete's
   own view inside the portal (components/profile-showcase.tsx): the same
   sections and numbers, but no sponsor-side action (memory: portal-views-
   stay-in-portal). "Request a proposal" becomes where a sponsor's interest
   lands for the athlete, Invitations; "Is this you?" goes; the name is an
   h2 under the portal's own "Public profile" h1.
   -------------------------------------------------------------------------- */

const ROOT_ID = "pp-root";

export function AthletePublicPage({
  a, mode = "public", openedFromPortal = false, live = true,
}: {
  a: PublicAthlete;
  mode?: "public" | "owner";
  /** Public mode, arrived from the portal's link: say this is what others see. */
  openedFromPortal?: boolean;
  /** Owner mode: false while the profile waits for BTG to activate it. */
  live?: boolean;
}) {
  const owner = mode === "owner";
  const Name = owner ? "h2" : "h1";
  const publicPath = `/athletes/${encodeURIComponent(a.slug)}`;
  const first = firstName(a.displayName);
  const t = a.track ?? null;
  const r = reach(a.socials);
  const badges = earnedBadges(a);
  const pct = onTimePercent(t);
  const since = monthLabel(a.memberSince);
  const place = [a.city, a.stateCode].filter(Boolean).join(", ");
  const roleLine = [a.position, a.sport].filter(Boolean).join(" · ");
  const level = a.level ? words(a.level) : null;

  return (
    <div id={ROOT_ID} className="pp-root" data-mode={mode}>
      <ProfileFx rootId={ROOT_ID} />
      <noscript>
        <style>{`.pp-root *{animation:none!important}`}</style>
      </noscript>

      {!owner && openedFromPortal && (
        <p role="status" className="pp-owner">
          <Glyph name="eye" />
          Opened from the athlete portal. This is exactly what sponsors and fans see.
        </p>
      )}

      {/* ── 1. The hero: cover, photo, name, the one action, the big three numbers ── */}
      <section className="pp-hero" data-pp-hero aria-labelledby="pp-name">
        <div className="pp-cover" aria-hidden="true">
          <span className="pp-blob pp-blob-a" />
          <span className="pp-blob pp-blob-b" />
          <span className="pp-blob pp-blob-c" />
          <svg className="pp-court" viewBox="0 0 1200 260" preserveAspectRatio="xMidYMid slice">
            <rect x="40" y="30" width="1120" height="200" rx="6" />
            <line x1="600" y1="30" x2="600" y2="230" />
            <circle cx="600" cy="130" r="54" />
            <path d="M40 80h120v100H40M1160 80h-120v100h120" />
          </svg>
          <span className="pp-sport-word">{a.sport}</span>
          <span className="pp-sheen" />
        </div>

        <div className="pp-hero-body">
          <div className="pp-photo-wrap pp-in" style={{ "--d": "0.05s" } as CSSProperties}>
            <span className="pp-photo-ring" aria-hidden="true" />
            <div className="pp-photo">
              {a.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- R2 CDN image; next/image optimisation is host-specific (stay host-portable)
                <img src={a.photoUrl} alt={`${a.displayName}, ${a.sport} athlete`} />
              ) : (
                <span className="pp-monogram" aria-hidden="true">{initials(a.displayName)}</span>
              )}
            </div>
            {live && <span className="pp-live-dot" title="Active on SponsorX" aria-hidden="true" />}
          </div>

          <div className="pp-id">
            <div className="pp-name-row">
              <Name id="pp-name" className="pp-name" aria-label={a.displayName}>
                <SplitName name={a.displayName} />
              </Name>
              {live && (
                <span className="pp-verified pp-in" style={{ "--d": "0.55s" } as CSSProperties}>
                  <Glyph name="check" />
                  Verified athlete
                </span>
              )}
            </div>
            <p className="pp-role pp-in" style={{ "--d": "0.4s" } as CSSProperties}>
              {roleLine}
              {level && <span className="pp-role-level">{level}</span>}
            </p>
            <ul className="pp-meta pp-in" style={{ "--d": "0.5s" } as CSSProperties}>
              {a.school && <li><Glyph name="school" />{a.school}</li>}
              {place && <li><Glyph name="pin" />{place}</li>}
              {since && <li><Glyph name="calendar" />On SponsorX since {since}</li>}
            </ul>
            <div className="pp-actions pp-in" style={{ "--d": "0.6s" } as CSSProperties}>
              {owner ? (
                <Link href="/athlete/invitations" className="pp-btn pp-btn-primary">
                  <span>Your invitations</span>
                  <Glyph name="arrow" />
                </Link>
              ) : (
                <Link href="/brief" className="pp-btn pp-btn-primary">
                  <span>Request a proposal</span>
                  <Glyph name="arrow" />
                </Link>
              )}
              {live && <ShareProfile name={a.displayName} path={publicPath} label={owner ? "Share your page" : "Share profile"} />}
            </div>
          </div>

          <div className="pp-side">
            <ul className="pp-stickers" aria-label="Badges">
              {badges.slice(0, 4).map((b, i) => (
                <li key={b.id} className="pp-sticker" data-tone={b.tone} style={{ "--i": i } as CSSProperties} tabIndex={0} aria-label={`${b.label}: ${b.why}`}>
                  <Seal />
                  <span className="pp-sticker-text" aria-hidden="true">{b.short}</span>
                  <span className="pp-tip" role="tooltip">
                    <strong>{b.label}</strong>
                    {b.why}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="pp-bigstats">
              <BigStat label="Total reach" value={r.total} note={r.total ? (r.allVerified ? "verified" : "incl. self-reported") : "no counts yet"} />
              <BigStat label="Campaigns" value={t?.campaignsCompleted ?? 0} note="completed" />
              <BigStat label="Posts live" value={t?.postsLive ?? 0} note={t?.postsVerified ? `${t.postsVerified} verified` : "sponsored"} />
            </dl>
          </div>
        </div>
      </section>

      {/* ── the three questions, as tabs that follow the page ── */}
      <nav className="pp-tabs" data-pp-tabs aria-label="Profile sections">
        <a href="#track">Track record{t && t.campaignsCompleted > 0 && <sup>{t.campaignsCompleted}</sup>}</a>
        <a href="#reach">Reach{a.socials.length > 0 && <sup>{a.socials.length}</sup>}</a>
        <a href="#about">About</a>
        <span className="pp-tab-ind" aria-hidden="true" />
      </nav>

      <div className="pp-body">
        <div className="pp-main">
          {/* ── 2. Track record ── */}
          <section id="track" className="pp-section" aria-labelledby="track-h">
            <header className="pp-section-head" data-reveal>
              <p className="pp-eyebrow">Track record{since ? ` · since ${since}` : ""}</p>
              <h2 id="track-h" className="pp-h2">What {first} has done on SponsorX</h2>
              <p className="pp-lede">{storyLine(a)}</p>
            </header>

            <div className="pp-tiles">
              <Tile i={0} icon="trophy" tone="accent" value={t?.campaignsCompleted ?? 0} label="Campaigns completed" hint="Finished, start to end" />
              <Tile i={1} icon="handshake" tone="primary" value={t?.brands ?? 0} label="Brands worked with" hint="Accepted work from" />
              <Tile i={2} icon="play" tone="success" value={t?.postsLive ?? 0} label="Sponsored posts live" hint={t?.postsVerified ? `${t.postsVerified} checked live by SponsorX` : "Published on their socials"} />
              <Tile i={3} icon="ticket" tone="next" value={t?.fanRedemptions ?? 0} label="Fan rewards redeemed" hint="Through their QR codes" />
            </div>
            <p className="pp-source" data-reveal>
              <Glyph name="db" /> Counted by SponsorX from finished work. Brand names and prices stay private.
            </p>

            <div className="pp-duo">
              <div data-reveal style={{ "--d": "0.05s" } as CSSProperties}>
                <article className="pp-card pp-ontime" data-tilt>
                  <Ring pct={pct} />
                  <div>
                    <h3 className="pp-h3">On-time delivery</h3>
                    {pct === null ? (
                      <p className="pp-muted">Starts with {first}&rsquo;s first sponsored post.</p>
                    ) : (
                      <p className="pp-muted">
                        <strong className="pp-strong">{t!.onTime.onTime} of {t!.onTime.of}</strong> posts went up by their due date.
                      </p>
                    )}
                  </div>
                  <span className="pp-glare" aria-hidden="true" />
                </article>
              </div>
              <div data-reveal style={{ "--d": "0.12s" } as CSSProperties}>
                <article className="pp-card pp-badges">
                  <h3 className="pp-h3">Badges earned</h3>
                  <ul>
                    {badges.map((b) => (
                      <li key={b.id} data-tone={b.tone}>
                        <span className="pp-mini-seal" aria-hidden="true"><Seal />
                          <span>{b.short}</span>
                        </span>
                        <span>
                          <strong className="pp-strong">{b.label}</strong>
                          <span className="pp-muted block">{b.why}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              </div>
            </div>

            <div className="pp-sub" data-reveal>
              <h3 className="pp-h3">Latest sponsored posts</h3>
              {t && t.recent.length > 0 && <span className="pp-muted">Platform and month only</span>}
            </div>
            {t && t.recent.length > 0 ? (
              <ul className="pp-works">
                {t.recent.map((p, i) => (
                  <li key={`${p.month}-${i}`} data-reveal style={{ "--d": `${i * 0.07}s` } as CSSProperties}>
                    <article className="pp-work" data-tilt data-platform={(p.platform ?? "other").toLowerCase()}>
                      <div className="pp-work-art" aria-hidden="true">
                        <PlatformGlyph platform={p.platform} />
                        <span className="pp-work-wave" />
                      </div>
                      <div className="pp-work-foot">
                        <span>
                          <strong className="pp-strong">{platformName(p.platform)} post</strong>
                          <span className="pp-muted block">{monthLabel(p.month)}</span>
                        </span>
                        <span className={p.verified ? "pp-chip pp-chip-ok" : "pp-chip"}>
                          {p.verified ? <><Glyph name="check" />Verified</> : "Live"}
                        </span>
                      </div>
                      <span className="pp-glare" aria-hidden="true" />
                    </article>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="pp-empty" data-reveal>
                <span className="pp-empty-icon" aria-hidden="true"><Glyph name="spark" /></span>
                <p>
                  <strong className="pp-strong">{first}&rsquo;s first campaign shows up here.</strong>
                  <span className="pp-muted block">Every finished post is added automatically, with whether SponsorX checked it live.</span>
                </p>
              </div>
            )}
          </section>

          {/* ── 3. Reach ── */}
          <section id="reach" className="pp-section" aria-labelledby="reach-h">
            <header className="pp-section-head" data-reveal>
              <p className="pp-eyebrow">Reach</p>
              <h2 id="reach-h" className="pp-h2">Who sees {first}&rsquo;s posts</h2>
              <p className="pp-lede">
                {r.total > 0 ? (
                  <><strong className="pp-strong">{r.total.toLocaleString("en-US")} followers</strong> across {plural(a.socials.length, "account")}.</>
                ) : (
                  <>{first} hasn&rsquo;t listed follower counts yet.</>
                )}
              </p>
            </header>
            {a.socials.length === 0 ? (
              <div className="pp-empty" data-reveal>
                <span className="pp-empty-icon" aria-hidden="true"><Glyph name="spark" /></span>
                <p className="pp-muted">No accounts listed yet.</p>
              </div>
            ) : (
              <ul className="pp-socials">
                {r.rows.map((s, i) => (
                  <li key={`${s.platform}:${s.handle}`} data-reveal style={{ "--d": `${i * 0.08}s` } as CSSProperties}>
                    <article className="pp-card pp-social" data-tilt data-platform={s.platform.toLowerCase()}>
                      <div className="pp-social-top">
                        <span className="pp-social-icon" aria-hidden="true"><PlatformGlyph platform={s.platform} /></span>
                        <span className="min-w-0">
                          <strong className="pp-strong block">{platformName(s.platform)}</strong>
                          <span className="pp-muted block truncate">@{s.handle}</span>
                        </span>
                      </div>
                      <p className="pp-social-src"><SourceLabel source={s.source as never} /></p>
                      <p className="pp-social-num">
                        {s.followers !== null ? <CountUp value={s.followers} /> : "—"}
                        <span className="pp-muted">followers</span>
                      </p>
                      <span className="pp-bar" aria-hidden="true">
                        <span style={{ "--share": s.share.toFixed(3) } as CSSProperties} />
                      </span>
                      <span className="pp-muted pp-small">{s.followers ? `${Math.round(s.share * 100)}% of total reach` : "No count listed"}</span>
                      <span className="pp-glare" aria-hidden="true" />
                    </article>
                  </li>
                ))}
              </ul>
            )}
            <p className="pp-source" data-reveal>
              <Glyph name="db" /> Each number shows where it came from. &ldquo;Self-reported&rdquo; means {first} entered it and SponsorX hasn&rsquo;t checked it yet.
            </p>
          </section>

          {/* ── 4. About ── */}
          <section id="about" className="pp-section" aria-labelledby="about-h">
            <header className="pp-section-head" data-reveal>
              <p className="pp-eyebrow">About</p>
              <h2 id="about-h" className="pp-h2">Get to know {first}</h2>
            </header>
            <div className="pp-about">
              <div data-reveal>
                <article className="pp-card pp-intro">
                  <h3 className="pp-h3">Highlights</h3>
                  {a.achievements ? (
                    <blockquote className="pp-quote">{a.achievements}</blockquote>
                  ) : (
                    <p className="pp-muted">{first} hasn&rsquo;t added highlights yet.</p>
                  )}
                  <ul className="pp-facts">
                    <Fact icon="ball" label="Sport" value={a.sport} />
                    {a.position && <Fact icon="target" label="Position" value={a.position} />}
                    {level && <Fact icon="stairs" label="Level" value={level} />}
                    {a.school && <Fact icon="school" label="School" value={a.school} />}
                    {place && <Fact icon="pin" label="Hometown" value={place} />}
                    {since && <Fact icon="calendar" label="On SponsorX since" value={since} />}
                  </ul>
                </article>
              </div>
              <div className="pp-about-side">
                <div data-reveal style={{ "--d": "0.06s" } as CSSProperties}>
                  <article className="pp-card">
                    <h3 className="pp-h3">Content {first} makes</h3>
                    <Chips items={a.contentCapabilities.map(capabilityLabel)} tone="primary" empty="Not listed yet." />
                  </article>
                </div>
                <div data-reveal style={{ "--d": "0.12s" } as CSSProperties}>
                  <article className="pp-card">
                    <h3 className="pp-h3">Brands {first} wants to work with</h3>
                    <Chips items={a.brandInterests.map((c) => categoryLabel(c as BrandCategory))} tone="accent" empty="Open to any category." />
                  </article>
                </div>
              </div>
            </div>
          </section>
        </div>

        {owner ? <OwnerAside a={a} live={live} /> : (
        /* ── the one action, explained in three steps ── */
        <aside className="pp-aside" aria-label={`Work with ${first}`}>
          <div className="pp-card pp-cta">
            <span className="pp-cta-glow" aria-hidden="true" />
            <p className="pp-eyebrow">Work with {first}</p>
            <h2 className="pp-h3 pp-cta-title">Sponsor {first} in three steps</h2>
            <ol className="pp-steps">
              <li><span>1</span><p><strong className="pp-strong">Tell BTG your goal.</strong> A short brief: who you want to reach and when.</p></li>
              <li><span>2</span><p><strong className="pp-strong">BTG does the checks.</strong> Matching, conflicts and pricing, done for you.</p></li>
              <li><span>3</span><p><strong className="pp-strong">Approve the proposal.</strong> No card and no checkout until you say yes.</p></li>
            </ol>
            <Link href="/brief" className="pp-btn pp-btn-primary pp-btn-block">
              <span>Request a proposal</span>
              <Glyph name="arrow" />
            </Link>
            <p className="pp-fine">Rates are agreed between the athlete and BTG and never appear on a public page.</p>
          </div>
          <div className="pp-card pp-claim">
            <p className="pp-strong">Is this you?</p>
            <p className="pp-muted">Sign in to update these sections. Your changes appear here straight away.</p>
            <Link href="/athlete/profile" className="pp-link">Open your portal <Glyph name="arrow" /></Link>
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}

/** Owner mode's side card: where a sponsor's interest lands for the athlete,
 *  and what would make the page stronger. No sponsor-side button. */
function OwnerAside({ a, live }: { a: PublicAthlete; live: boolean }) {
  const boosts = pageBoosts(a);
  return (
    <aside className="pp-aside" aria-label="Your page">
      <div className="pp-card pp-cta">
        <span className="pp-cta-glow" aria-hidden="true" />
        <p className="pp-eyebrow">{live ? "Your page is live" : "Not live yet"}</p>
        <h3 className="pp-h3 pp-cta-title">How sponsors reach you</h3>
        <ol className="pp-steps">
          <li><span>1</span><p><strong className="pp-strong">A sponsor finds this page.</strong> Their copy has a &ldquo;Request a proposal&rdquo; button that goes to BTG.</p></li>
          <li><span>2</span><p><strong className="pp-strong">BTG matches you.</strong> They check for clashes with what you won&rsquo;t promote.</p></li>
          <li><span>3</span><p><strong className="pp-strong">You get an invitation.</strong> Accept or decline it in Invitations.</p></li>
        </ol>
        <Link href="/athlete/invitations" className="pp-btn pp-btn-primary pp-btn-block">
          <span>Open Invitations</span>
          <Glyph name="arrow" />
        </Link>
        <p className="pp-fine">Your rates and what you won&rsquo;t promote never appear on this page.</p>
      </div>
      {boosts.length > 0 && (
        <div className="pp-card pp-claim">
          <p className="pp-strong">Make your page stand out</p>
          <ul className="pp-boosts">
            {boosts.map((b) => (
              <li key={b}><Glyph name="spark" />{b}</li>
            ))}
          </ul>
          <Link href="/athlete/profile/edit" className="pp-link">Edit profile <Glyph name="arrow" /></Link>
        </div>
      )}
    </aside>
  );
}

/** What the page is missing that sponsors look for, in plain words. Owner mode only. */
export function pageBoosts(a: PublicAthlete): string[] {
  const out: string[] = [];
  if (!a.photoUrl) out.push("Add a photo: pages with a face get noticed first.");
  if (!a.achievements?.trim()) out.push("Add highlights: titles, records, awards.");
  if (!a.school) out.push("Add your school or team.");
  if (!a.socials.some((s) => (s.followers ?? 0) > 0)) out.push("Add follower counts to your social accounts.");
  return out;
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

/** The name, letter by letter; words never break apart. Screen readers read the h1's label. */
function SplitName({ name }: { name: string }) {
  let i = 0;
  return (
    <span aria-hidden="true">
      {name.split(/(\s+)/).map((part, w) =>
        /^\s+$/.test(part) ? (
          <span key={w}> </span>
        ) : (
          <span key={w} className="pp-word">
            {[...part].map((ch) => (
              <span key={i} className="pp-letter" style={{ "--i": i++ } as CSSProperties}>{ch}</span>
            ))}
          </span>
        ),
      )}
    </span>
  );
}

function BigStat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="pp-bigstat">
      <dt>{label}</dt>
      <dd>
        <span className="pp-bignum" aria-label={value.toLocaleString("en-US")}>
          {value >= 10_000 ? compact(value) : <CountUp value={value} />}
        </span>
        <span className="pp-bignote">{note}</span>
      </dd>
    </div>
  );
}

function Tile({ i, icon, tone, value, label, hint }: { i: number; icon: GlyphName; tone: BadgeTone; value: number; label: string; hint: string }) {
  return (
    <div data-reveal style={{ "--d": `${i * 0.07}s` } as CSSProperties}>
      <article className="pp-card pp-tile" data-tilt data-tone={tone}>
        <span className="pp-tile-icon" aria-hidden="true"><Glyph name={icon} /></span>
        <p className="pp-tile-num"><CountUp value={value} /></p>
        <h3 className="pp-tile-label">{label}</h3>
        <p className="pp-muted pp-small">{hint}</p>
        <span className="pp-glare" aria-hidden="true" />
      </article>
    </div>
  );
}

const RING_C = 2 * Math.PI * 52;

function Ring({ pct }: { pct: number | null }) {
  return (
    <div className="pp-ring" style={{ "--c": RING_C.toFixed(2), "--p": ((pct ?? 0) / 100).toFixed(3) } as CSSProperties}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" className="pp-ring-track" />
        <circle cx="60" cy="60" r="52" className="pp-ring-val" strokeDasharray={RING_C.toFixed(2)} />
      </svg>
      <span className="pp-ring-num"><span>{pct === null ? "—" : <><CountUp value={pct} />%</>}</span></span>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: GlyphName; label: string; value: string }) {
  return (
    <li>
      <span className="pp-fact-icon" aria-hidden="true"><Glyph name={icon} /></span>
      <span>
        <span className="pp-muted pp-small block">{label}</span>
        <strong className="pp-strong">{value}</strong>
      </span>
    </li>
  );
}

function Chips({ items, tone, empty }: { items: string[]; tone: "primary" | "accent"; empty: string }) {
  if (items.length === 0) return <p className="pp-muted">{empty}</p>;
  return (
    <ul className="pp-chips" data-tone={tone}>
      {items.map((c, i) => (
        <li key={c} style={{ "--i": i } as CSSProperties}>{c}</li>
      ))}
    </ul>
  );
}

/** A scalloped seal, like a sticker. 24 points alternating two radii, softened by a round stroke. */
const SEAL_POINTS = Array.from({ length: 24 }, (_, k) => {
  const rad = k % 2 === 0 ? 46 : 41;
  const ang = (Math.PI * 2 * k) / 24 - Math.PI / 2;
  return `${(50 + rad * Math.cos(ang)).toFixed(2)},${(50 + rad * Math.sin(ang)).toFixed(2)}`;
}).join(" ");

function Seal() {
  return (
    <svg viewBox="0 0 100 100" className="pp-seal" aria-hidden="true">
      <polygon points={SEAL_POINTS} />
    </svg>
  );
}

function PlatformGlyph({ platform }: { platform: string | null }) {
  const p = (platform ?? "").toUpperCase();
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (p === "INSTAGRAM") return <svg {...common}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" /></svg>;
  if (p === "TIKTOK") return <svg {...common}><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.4 2.6 2.2 4.3 5 4.6" /></svg>;
  if (p === "YOUTUBE") return <svg {...common}><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" /></svg>;
  if (p === "X") return <svg {...common}><path d="M4 4l16 16M20 4L4 20" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17" /></svg>;
}

type GlyphName = "check" | "arrow" | "pin" | "school" | "calendar" | "trophy" | "handshake" | "play" | "ticket" | "db" | "spark" | "ball" | "target" | "stairs" | "eye";

const GLYPHS: Record<GlyphName, ReactNode> = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></>,
  school: <><path d="M3 9l9-5 9 5-9 5-9-5z" /><path d="M7 11.2V16c1.4 1.4 3 2 5 2s3.6-.6 5-2v-4.8" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0V4z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4" /></>,
  handshake: <><path d="M3 11l4-4 5 3 5-3 4 4" /><path d="M7 7v5l4 4c.8.8 2 .8 2.8 0L18 12V7" /></>,
  play: <><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M10 9v6l5-3z" /></>,
  ticket: <><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4V7.5z" /><path d="M14 6v12" strokeDasharray="2 2" /></>,
  db: <><ellipse cx="12" cy="6" rx="7" ry="2.8" /><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" /></>,
  spark: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />,
  ball: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17M3.5 12h17M6 6c3 2 3 10 0 12M18 6c-3 2-3 10 0 12" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></>,
  stairs: <path d="M4 20h4v-4h4v-4h4V8h4V4" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
};

function Glyph({ name }: { name: GlyphName }) {
  return (
    <svg viewBox="0 0 24 24" className="pp-glyph" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[name]}
    </svg>
  );
}
