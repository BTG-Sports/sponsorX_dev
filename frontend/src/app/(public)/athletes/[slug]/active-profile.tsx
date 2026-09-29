import Link from "next/link";
import { Badge, Card, SourceLabel } from "@/components/ui";
import { initials } from "@/components/hero";
import { categoryLabel, type BrandCategory } from "@/lib/brand-categories";
import { capabilityLabel } from "@/lib/content-capabilities";
import type { PublicAthlete } from "./featured-profile";

/* --------------------------------------------------------------------------
   P3-FE-08 — an ACTIVE athlete's public page, from GET /public/athletes/:slug.

   Exactly the §11 PUBLIC sections and nothing else: identity (display name,
   place), sport, socials with their provenance label, capabilities,
   interests. No legal name, contact, age, rates or restrictions — the API
   never sends them, and this page has nowhere to put them. Minors look the
   same as adults here; nothing on the page says an age.

   Phase 1 is a managed marketplace: the one action is to request a proposal
   through BTG, who match, check conflicts and price — never a purchase.
   -------------------------------------------------------------------------- */

const words = (s: string) => (s.charAt(0) + s.slice(1).toLowerCase()).replaceAll("_", " ");
const num = (n: number) => n.toLocaleString("en-US");

export function ActiveProfile({ a }: { a: PublicAthlete }) {
  const meta = [a.sport, a.position, a.level ? words(a.level) : null].filter(Boolean).join(" · ");
  const place = [a.school, [a.city, a.stateCode].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const first = a.displayName.split(" ")[0] ?? a.displayName;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-4">
        <Card className="relative overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-athlete opacity-[0.12] blur-[60px]" />
          <div className="relative flex flex-wrap items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl border border-athlete/40 bg-athlete/[0.08] text-lg font-bold text-athlete">
              {initials(a.displayName)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">{a.displayName}</h1>
                <Badge tone="accent">Active athlete</Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{meta}</p>
              {place && <p className="mt-0.5 text-xs text-muted">{place}</p>}
            </div>
          </div>
        </Card>

        {a.achievements && (
          <Card>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Achievements</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-text">{a.achievements}</p>
          </Card>
        )}

        <Card>
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Social reach</p>
          {a.socials.length === 0 ? (
            <p className="mt-2 text-xs text-muted">No accounts listed yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line-soft">
              {a.socials.map((s) => (
                <li key={`${s.platform}:${s.handle}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-xs">
                  <span className="w-20 font-medium">{words(s.platform)}</span>
                  <span className="text-muted">@{s.handle.replace(/^@/, "")}</span>
                  {s.followers !== null && <span className="tabular-nums text-muted">{num(s.followers)} followers</span>}
                  <SourceLabel source={s.source as never} />
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-faint">Every number says where it came from (§22). Self-reported counts have not been checked by BTG.</p>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Content they deliver</p>
            {a.contentCapabilities.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Not listed yet.</p>
            ) : (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {a.contentCapabilities.map((c) => (
                  <Badge key={c} tone="neutral">{capabilityLabel(c)}</Badge>
                ))}
              </p>
            )}
          </Card>
          <Card>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Brand interests</p>
            {a.brandInterests.length === 0 ? (
              <p className="mt-2 text-xs text-muted">Not listed yet.</p>
            ) : (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {a.brandInterests.map((c) => (
                  <Badge key={c} tone="primary">{categoryLabel(c as BrandCategory)}</Badge>
                ))}
              </p>
            )}
          </Card>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        <Card>
          <p className="text-sm font-medium">Work with {first}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            Tell BTG what you want to achieve. They match eligible athletes, screen every restriction and conflict, price the campaign and come back with a proposal — no card, no checkout.
          </p>
          <Link
            href="/brief"
            className="mt-3 block w-full rounded-lg bg-primary py-2.5 text-center text-xs font-medium text-cta-ink transition-colors hover:bg-primary-soft"
          >
            Request a proposal
          </Link>
          <p className="mt-2 text-[10px] leading-relaxed text-faint">
            Rates are set between the athlete and BTG and never appear on a public page.
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium">Is this you?</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Sign in to your portal to update these sections — BTG reviews public changes before they appear here.
          </p>
          <Link href="/athlete/profile" className="mt-2 inline-block text-[11px] font-medium text-accent hover:text-accent-soft">
            Open your portal →
          </Link>
        </Card>
      </div>
    </div>
  );
}
