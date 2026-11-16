import { ArenaChip, ArenaLink, ArenaPanel, ArenaSection } from "@/components/arena-stage";
import { AthletePublicPage } from "@/components/athlete-public-page/athlete-public-page";
import { money } from "@/lib/fixtures";
import type { ApiRate } from "@/lib/profile-live";
import type { PublicAthlete } from "@/lib/public-athlete";

/* --------------------------------------------------------------------------
   ProfileShowcase — /athlete/profile once the profile is complete
   (POL-FE-80, 2026-11-16). The owner: "once they complete it hide the open
   public page and show now the public page itself".

   POL-FE-82 (owner, same day): the public page here IS the redesigned public
   page (components/athlete-public-page), in its owner mode, instead of a
   smaller copy of it. The page passes what GET /public/athletes/:slug sends
   for a live profile (so the owner sees exactly what a sponsor does, track
   record and photo included), or the profile's public sections from
   `publicFace` while it waits for BTG. Owner mode has no sponsor-side
   action (memory: portal-views-stay-in-portal): "Request a proposal"
   becomes "How sponsors reach you" → Invitations.

   Above it, the page's address and whether it is live; under it, the
   private sections, which never reach the public page: restrictions, the
   rate card and agreements.

   A server component; the island (profile-wizard.tsx) receives it as a
   rendered node, never a render function.
   -------------------------------------------------------------------------- */

const words = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");

export type ShowcasePrivate = {
  restrictedCategories: string[];
  restrictionNotes: string | null;
  rates: ApiRate[];
  tier: string | null;
  agreementsSigned: number;
};

export function ProfileShowcase({
  page, slug, live, priv,
}: {
  /** What the public page shows: the public read when live, else the public sections. */
  page: PublicAthlete;
  slug: string;
  /** ACTIVE: the public page answers now. Otherwise it is ready and waits for BTG. */
  live: boolean;
  priv: ShowcasePrivate;
}) {
  return (
    <div className="sx-pw-show space-y-8">
      {/* ---------------------------------------------------- the public page */}
      <section aria-label="Your public page" className="space-y-4">
        <div className="sx-pw-browser">
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
        </div>
        <p className="text-[11px] leading-relaxed text-faint">
          {live
            ? "This is your public page, exactly as sponsors and fans see it."
            : "This is your public page. It goes live for sponsors as soon as BTG activates your profile."}{" "}
          Changes you save show here and there straight away.
        </p>
        <AthletePublicPage a={page} mode="owner" live={live} />
      </section>

      {/* --------------------------------------------- only you and BTG see */}
      <section aria-label="Private sections">
        <ArenaSection title="Only you and BTG see this" hint="Never on your public page." delay={0.2} />
        <div className="grid gap-4 lg:grid-cols-3">
          <ArenaPanel tone="danger" delay={0.25}>
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
          <ArenaPanel tone="blue" delay={0.31}>
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
          <ArenaPanel tone="win" delay={0.37}>
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
