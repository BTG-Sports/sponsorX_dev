import type { CSSProperties } from "react";

import { ArenaChip, ArenaLink, ArenaPanel, ArenaSection } from "@/components/arena-stage";
import { ArenaCount } from "@/components/arena-fx";
import { Badge, SourceLabel } from "@/components/ui";
import { categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import { capabilityLabel } from "@/lib/content-capabilities";
import { money } from "@/lib/fixtures";
import type { ApiRate } from "@/lib/profile-live";
import { metaLine, placeLine, type PublicFace } from "@/lib/profile-wizard";

/* --------------------------------------------------------------------------
   ProfileShowcase — /athlete/profile once the profile is complete
   (POL-FE-80, 2026-11-16). The owner: "once they complete it hide the open
   public page and show now the public page itself".

   The public page's own sections, in its order (app/(public)/athletes/
   [slug]/active-profile.tsx): the name with its sport and place,
   achievements, social reach with each number's provenance, the content
   they deliver, brand interests. They are built from `publicFace`, which
   carries only what GET /public/athletes/:slug sends, so the owner never
   sees more here than a sponsor does. Framed as a browser window with the
   page's address and whether it is live.

   Owner-framed (memory: portal-views-stay-in-portal): the sponsor's
   "Request a proposal" becomes where a sponsor's interest actually lands
   for the athlete, Invitations. Under the frame, the private sections,
   which never reach the public page: restrictions, the rate card and
   agreements.

   A server component; the island (profile-wizard.tsx) receives it as a
   rendered node. Its entrance is CSS (profile.css, `.sx-pw-show`).
   -------------------------------------------------------------------------- */

const words = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");
const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
const at = (s: number) => ({ "--d": `${s}s` }) as CSSProperties;

/** §22 — the provenance tokens SourceLabel can name; anything else prints raw. */
const SOURCES = ["VERIFIED_SYSTEM", "VERIFIED_API", "VERIFIED_MANUAL", "SELF_REPORTED", "ESTIMATED", "ATTRIBUTED"] as const;
type Source = (typeof SOURCES)[number];
function Provenance({ source }: { source: string }) {
  return (SOURCES as readonly string[]).includes(source) ? <SourceLabel source={source as Source} /> : <Badge tone="neutral">{words(source)}</Badge>;
}

export type ShowcasePrivate = {
  restrictedCategories: string[];
  restrictionNotes: string | null;
  rates: ApiRate[];
  tier: string | null;
  agreementsSigned: number;
};

export function ProfileShowcase({
  face, slug, live, priv,
}: {
  face: PublicFace;
  slug: string;
  /** ACTIVE: the public page answers now. Otherwise it is ready and waits for BTG. */
  live: boolean;
  priv: ShowcasePrivate;
}) {
  const meta = metaLine(face);
  const place = placeLine(face);
  const counted = face.socials.filter((s) => s.followers !== null);
  const reach = counted.reduce((n, s) => n + (s.followers ?? 0), 0);
  const top = Math.max(1, ...counted.map((s) => s.followers ?? 0));
  const sources = new Set(counted.map((s) => s.source));
  /* One reach figure needs one provenance (§22): mixed sources would put
     one label on two kinds of number, so then the total isn't drawn. */
  const oneSource = counted.length > 0 && sources.size === 1 ? [...sources][0] : null;
  /* Each word with the index of its first letter, for the stagger. */
  const wordsOf = face.displayName.trim().split(/\s+/).reduce<{ text: string; start: number }[]>(
    (acc, text) => [...acc, { text, start: acc.reduce((n, x) => n + x.text.length, 0) }],
    [],
  );

  return (
    <div className="sx-pw-show space-y-8">
      {/* ---------------------------------------------------- the public page */}
      <section aria-label="Your public page" className="sx-pw-browser">
        <div className="sx-pw-bar">
          <span className="sx-pw-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="sx-pw-address">
            <span className="text-faint">sponsorx</span>
            <span>/athletes/{slug}</span>
          </span>
          <span className="sx-pw-status" data-live={live ? "" : undefined}>
            <span className="sx-pw-live-dot" aria-hidden="true" />
            {live ? "Live" : "Not live yet"}
          </span>
        </div>

        <div className="sx-pw-page">
          {/* the hero: who, what, where */}
          <div className="sx-pw-hero">
            <span aria-hidden="true" className="sx-pw-hero-glow" />
            <span aria-hidden="true" className="sx-pw-hero-stripes" />
            <div className="sx-pw-badge" aria-hidden="true">
              <span className="sx-pw-badge-ring" />
              <span className="sx-pw-badge-face">{initials(face.displayName)}</span>
            </div>
            <div className="relative min-w-0">
              <p className="sx-pw-hero-kicker sx-pw-up" style={at(0.35)}>
                <ArenaChip tone="win">Active athlete</ArenaChip>
              </p>
              {/* letter by letter, each word kept whole so a long name wraps between words */}
              <h2 className="sx-pw-hero-name" aria-label={face.displayName}>
                {wordsOf.map((w, j) => (
                  <span key={j} aria-hidden="true">
                    {j > 0 && " "}
                    <span className="sx-pw-word">
                      {[...w.text].map((ch, k) => (
                        <span key={k} style={at(0.4 + (w.start + k) * 0.03)}>{ch}</span>
                      ))}
                    </span>
                  </span>
                ))}
              </h2>
              {meta && <p className="sx-pw-hero-meta sx-pw-up" style={at(0.6)}>{meta}</p>}
              {place && <p className="sx-pw-hero-place sx-pw-up" style={at(0.68)}>{place}</p>}
            </div>
          </div>

          {/* the numbers, from the sections below */}
          <dl className="sx-pw-stats">
            <div className="sx-pw-stat sx-pw-up" style={at(0.75)}>
              <dt>Followers</dt>
              <dd>
                {oneSource ? <ArenaCount value={reach} delay={0.8} className="sx-arena-num" /> : <span className="sx-arena-num">—</span>}
                <span className="sx-pw-stat-cap">{oneSource ? <Provenance source={oneSource} /> : counted.length ? "mixed sources" : "none listed"}</span>
              </dd>
            </div>
            <div className="sx-pw-stat sx-pw-up" style={at(0.82)}>
              <dt>Accounts</dt>
              <dd><ArenaCount value={face.socials.length} delay={0.86} className="sx-arena-num" /><span className="sx-pw-stat-cap">on the page</span></dd>
            </div>
            <div className="sx-pw-stat sx-pw-up" style={at(0.89)}>
              <dt>Content types</dt>
              <dd><ArenaCount value={face.contentCapabilities.length} delay={0.92} className="sx-arena-num" /><span className="sx-pw-stat-cap">sponsors can ask for</span></dd>
            </div>
            <div className="sx-pw-stat sx-pw-up" style={at(0.96)}>
              <dt>Brand interests</dt>
              <dd><ArenaCount value={face.brandInterests.length} delay={0.98} className="sx-arena-num" /><span className="sx-pw-stat-cap">categories</span></dd>
            </div>
          </dl>

          <div className="sx-pw-cols">
            <div className="min-w-0 space-y-4">
              {face.achievements && (
                <div className="sx-pw-card sx-pw-up" style={at(1.02)}>
                  <p className="sx-pw-card-label">Achievements</p>
                  <p className="sx-pw-quote">{face.achievements}</p>
                </div>
              )}
              <div className="sx-pw-card sx-pw-up" style={at(1.08)}>
                <p className="sx-pw-card-label">Social reach</p>
                {face.socials.length === 0 ? (
                  <p className="mt-2 text-xs text-muted">No accounts listed yet.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {face.socials.map((s, k) => (
                      <li key={`${s.platform}:${s.handle}`}>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                          <span className="w-20 font-semibold text-text">{words(s.platform)}</span>
                          <span className="min-w-0 flex-1 truncate text-muted">@{s.handle.replace(/^@/, "")}</span>
                          {s.followers !== null && <span className="font-semibold tabular-nums text-text">{s.followers.toLocaleString("en-US")}</span>}
                          <Provenance source={s.source} />
                        </div>
                        {s.followers !== null && (
                          <span className="sx-pw-reach" aria-hidden="true">
                            <i style={{ ...at(1.2 + k * 0.08), "--w": `${Math.max(4, Math.round((100 * s.followers) / top))}%` } as CSSProperties} />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-3 text-[10px] text-faint">Every number says where it came from. Self-reported counts have not been checked by BTG.</p>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="sx-pw-card sx-pw-up" style={at(1.14)}>
                <p className="sx-pw-card-label">Content they deliver</p>
                <Chips items={face.contentCapabilities.map(capabilityLabel)} delay={1.25} />
              </div>
              <div className="sx-pw-card sx-pw-up" style={at(1.2)}>
                <p className="sx-pw-card-label">Brand interests</p>
                <Chips items={face.brandInterests.map((c) => categoryLabel(c as BrandCategory))} delay={1.35} />
              </div>
              {/* the owner's pointer, where a sponsor's page has "Request a proposal" */}
              <div className="sx-pw-card sx-pw-card-flare sx-pw-up" style={at(1.26)}>
                <p className="text-sm font-semibold text-text">How sponsors reach you</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  Sponsors ask BTG, not you directly. BTG matches you to their campaigns, checks for clashes, and every invitation arrives in your Invitations.
                </p>
                <div className="mt-3"><ArenaLink href="/athlete/invitations">Invitations</ArenaLink></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <p className="sx-pw-up -mt-4 text-[11px] leading-relaxed text-faint" style={at(1.3)}>
        {live
          ? "This is your public page as sponsors and BTG see it. Their copy has a “Request a proposal” button, which sends the request to BTG."
          : "This is your public page. It goes live for sponsors as soon as BTG activates your profile."}{" "}
        Changes you save show here and there straight away.
      </p>

      {/* --------------------------------------------- only you and BTG see */}
      <section aria-label="Private sections">
        <ArenaSection title="Only you and BTG see this" hint="Never on your public page." delay={1.35} />
        <div className="grid gap-4 lg:grid-cols-3">
          <ArenaPanel tone="danger" delay={1.4}>
            <p className="text-sm font-semibold tracking-tight">What you won&rsquo;t promote</p>
            <div className="mt-2.5">
              {priv.restrictedCategories.length > 0 && (
                <p className="flex flex-wrap gap-1.5">
                  {priv.restrictedCategories.map((c) => <ArenaChip key={c} tone="danger">{words(c)}</ArenaChip>)}
                </p>
              )}
              {priv.restrictionNotes?.trim() && <p className="mt-2 text-xs text-muted">{priv.restrictionNotes}</p>}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-faint">Stops a clashing deal before it reaches you.</p>
          </ArenaPanel>
          <ArenaPanel tone="blue" delay={1.46}>
            <p className="text-sm font-semibold tracking-tight">Your rate card</p>
            {priv.rates.length === 0 ? (
              <p className="mt-2.5 text-xs text-muted">No rates set yet. Your BTG manager sets them with you, and they show here as soon as they&apos;re saved.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line-soft">
                {priv.rates.map((r) => (
                  <li key={r.jobId} className="flex items-baseline justify-between gap-3 py-1.5 text-xs first:pt-0 last:pb-0">
                    <span className="min-w-0 truncate font-medium">{r.jobName}</span>
                    <span className="sx-arena-num shrink-0 text-sm text-text">{money(r.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-faint">
              Your pay per job{priv.tier && <> · {words(priv.tier)} tier</>}. Sponsors see catalogue prices, never these.
            </p>
          </ArenaPanel>
          <ArenaPanel tone="win" delay={1.52}>
            <p className="text-sm font-semibold tracking-tight">Agreements</p>
            <p className="mt-2.5 text-xs text-muted">
              <span className="sx-arena-num text-sm text-text">{priv.agreementsSigned}</span>{" "}
              {priv.agreementsSigned === 1 ? "agreement" : "agreements"} accepted.
            </p>
            <div className="mt-3"><ArenaLink href="/athlete/confirmations">Confirmations</ArenaLink></div>
          </ArenaPanel>
        </div>
      </section>
    </div>
  );
}

function Chips({ items, delay }: { items: string[]; delay: number }) {
  if (items.length === 0) return <p className="mt-2 text-xs text-muted">Not listed yet.</p>;
  return (
    <p className="mt-2.5 flex flex-wrap gap-1.5">
      {items.map((x, k) => (
        <span key={x} className="sx-pw-chip" style={at(delay + k * 0.04)}>{x}</span>
      ))}
    </p>
  );
}
